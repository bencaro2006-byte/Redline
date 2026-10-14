import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveMetrics } from '@shared/types'
import type { StreamExit, StreamHandlers } from '../ps/stream'

interface FakeStream {
  handlers: StreamHandlers<LiveMetrics>
  stopped: boolean
  running: boolean
}

const streams: FakeStream[] = []

vi.mock('../ps/stream', () => ({
  startStream: (_id: string, _input: unknown, _schema: unknown, handlers: StreamHandlers<LiveMetrics>) => {
    const stream: FakeStream = { handlers, stopped: false, running: true }
    streams.push(stream)
    return {
      stop: () => {
        stream.stopped = true
      },
      isRunning: () => stream.running,
    }
  },
}))

const sample: LiveMetrics = { at: 'now', cpuLoad: 10, cpuClockMHz: 4000, memUsedBytes: 1, memTotalBytes: 2, gpuLoad: 5, gpuMemUsedBytes: 1 }
const exit = (stream: FakeStream | undefined, how: Partial<StreamExit> = {}): void => {
  if (stream === undefined) throw new Error('no stream')
  stream.running = false
  stream.handlers.onExit?.({ code: 1, stopped: stream.stopped, stderr: '', ...how })
}

beforeEach(async () => {
  streams.length = 0
  vi.resetModules()
})

describe('metrics sampler', () => {
  it('a late exit from a stopped sampler does not orphan the new one (unsubscribe/resubscribe race)', async () => {
    const monitor = await import('./index')
    const off1 = monitor.addMetricsListener(() => undefined)
    off1() // stops sampler #1 (its process has not exited yet)
    const off2 = monitor.addMetricsListener(() => undefined) // starts sampler #2
    exit(streams[0]) // sampler #1 finally exits
    off2()
    expect(streams.length).toBe(2)
    expect(streams[1]?.stopped).toBe(true)
    monitor.stopMetrics()
  })

  it('ignores samples from an old sampler and clears the last sample on stop', async () => {
    const monitor = await import('./index')
    const seen: LiveMetrics[] = []
    const off = monitor.addMetricsListener((m) => seen.push(m))
    streams[0]?.handlers.onData(sample)
    expect(seen.length).toBe(1)
    off()
    const late: LiveMetrics[] = []
    const off2 = monitor.addMetricsListener((m) => late.push(m))
    expect(late).toEqual([]) // no stale sample replayed after a stop
    streams[0]?.handlers.onData(sample) // old sampler talking after it was replaced
    expect(late).toEqual([])
    off2()
    monitor.stopMetrics()
  })

  it('pauses while hidden and resumes for existing listeners', async () => {
    const monitor = await import('./index')
    const off = monitor.addMetricsListener(() => undefined)
    monitor.setMetricsPaused(true)
    expect(streams[0]?.stopped).toBe(true)
    monitor.setMetricsPaused(false)
    expect(streams.length).toBe(2)
    expect(streams[1]?.stopped).toBe(false)
    off()
    monitor.stopMetrics()
  })

  it('restarts with backoff after an unexpected exit, but not when stopped on purpose', async () => {
    vi.useFakeTimers()
    try {
      const monitor = await import('./index')
      const off = monitor.addMetricsListener(() => undefined)
      exit(streams[0])
      vi.advanceTimersByTime(2000)
      expect(streams.length).toBe(2)
      off()
      exit(streams[1], { stopped: true })
      vi.advanceTimersByTime(60_000)
      expect(streams.length).toBe(2)
      monitor.stopMetrics()
    } finally {
      vi.useRealTimers()
    }
  })

  it('doubles the backoff up to 30 s', async () => {
    const { nextBackoff } = await import('./index')
    expect([0, 2000, 4000, 16_000, 30_000].map(nextBackoff)).toEqual([2000, 4000, 8000, 30_000, 30_000])
  })
})
