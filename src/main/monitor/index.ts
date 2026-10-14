// Live metrics sampler: Watch-Metrics.ps1 via ps/stream.ts (one LiveMetrics JSON line
// per ~1 s). The first listener starts the stream; removing the last stops it. If the
// script dies while listeners remain, it restarts with exponential backoff. The sampler
// pauses while the window is hidden or minimized so it never runs during a game.
import { z } from 'zod'
import type { LiveMetrics } from '@shared/types'
import { createLogger } from '../log'
import { startStream, type StreamHandle } from '../ps/stream'

const log = createLogger('monitor')

export type MetricsListener = (metrics: LiveMetrics) => void

export const SAMPLE_INTERVAL_MS = 1000
const MIN_BACKOFF_MS = 2000
const MAX_BACKOFF_MS = 30_000

const nullableNumber = z.number().nonnegative().nullable()

export const LiveMetricsSchema: z.ZodType<LiveMetrics> = z.object({
  at: z.string(),
  cpuLoad: z.number().min(0).max(100),
  cpuClockMHz: nullableNumber,
  memUsedBytes: z.number().nonnegative(),
  memTotalBytes: z.number().positive(),
  gpuLoad: z.number().min(0).max(100).nullable(),
  gpuMemUsedBytes: nullableNumber,
})

/** Next restart delay: doubles from MIN to MAX (pure). */
export function nextBackoff(previousMs: number): number {
  return previousMs <= 0 ? MIN_BACKOFF_MS : Math.min(MAX_BACKOFF_MS, previousMs * 2)
}

const listeners = new Set<MetricsListener>()
let handle: StreamHandle | null = null
let restartTimer: ReturnType<typeof setTimeout> | null = null
let backoffMs = 0
let lastSample: LiveMetrics | null = null
let paused = false

function shouldRun(): boolean {
  return listeners.size > 0 && !paused
}

function broadcast(metrics: LiveMetrics): void {
  lastSample = metrics
  backoffMs = 0
  listeners.forEach((listener) => {
    try {
      listener(metrics)
    } catch (err) {
      log.warn('metrics listener failed', err)
    }
  })
}

function scheduleRestart(): void {
  if (!shouldRun() || restartTimer !== null) return
  backoffMs = nextBackoff(backoffMs)
  log.warn(`metrics sampler stopped; restarting in ${backoffMs} ms`)
  restartTimer = setTimeout(() => {
    restartTimer = null
    if (shouldRun()) start()
  }, backoffMs)
}

function start(): void {
  if (handle?.isRunning()) return
  // Each stream only clears/restarts the module state while it is still the current one,
  // so a late exit from an old, already-stopped process cannot orphan a newer one.
  let mine: StreamHandle | null = null
  mine = startStream('watchMetrics', { parentPid: process.pid, intervalMs: SAMPLE_INTERVAL_MS }, LiveMetricsSchema, {
    onData: (metrics) => {
      if (handle === mine) broadcast(metrics)
    },
    onError: (error) => log.debug('metrics sample error', error.message),
    onExit: (exit) => {
      if (handle !== mine) return
      handle = null
      if (!exit.stopped) scheduleRestart()
    },
  })
  // startStream may have already reported a spawn failure (and scheduled a retry) synchronously.
  if (mine.isRunning()) handle = mine
}

function stop(): void {
  if (restartTimer !== null) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  handle?.stop()
  handle = null
  backoffMs = 0
  lastSample = null
}

/** Returns the unsubscribe function. A new listener immediately gets the last sample, if any. */
export function addMetricsListener(listener: MetricsListener): () => void {
  listeners.add(listener)
  if (lastSample !== null) listener(lastSample)
  if (listeners.size === 1 && !paused) start()
  let active = true
  return () => {
    if (!active) return
    active = false
    listeners.delete(listener)
    if (listeners.size === 0) stop()
  }
}

/** Pause while the window is hidden or minimized; resume (if anyone listens) when shown. */
export function setMetricsPaused(next: boolean): void {
  if (paused === next) return
  paused = next
  if (paused) stop()
  else if (listeners.size > 0) start()
}

/** Stops the sampler and drops all listeners (app quit). */
export function stopMetrics(): void {
  listeners.clear()
  stop()
}
