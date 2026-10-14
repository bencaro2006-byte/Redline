// Simulated LiveMetrics for the browser preview: a bounded random walk ticking every
// second while at least one subscriber is attached (same contract as the real API).
import type { LiveMetrics } from '@shared/types'

const GIB = 1024 ** 3
const TICK_MS = 1000

interface Walk {
  cpuLoad: number
  cpuClockMHz: number
  memUsedBytes: number
  gpuLoad: number
  gpuMemUsedBytes: number
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))
const jitter = (spread: number): number => (Math.random() - 0.5) * 2 * spread

function step(prev: Walk): Walk {
  return {
    cpuLoad: clamp(prev.cpuLoad + jitter(9), 4, 96),
    cpuClockMHz: clamp(prev.cpuClockMHz + jitter(120), 3600, 4200),
    memUsedBytes: clamp(prev.memUsedBytes + jitter(0.15 * GIB), 7 * GIB, 14 * GIB),
    gpuLoad: clamp(prev.gpuLoad + jitter(12), 0, 99),
    gpuMemUsedBytes: clamp(prev.gpuMemUsedBytes + jitter(0.1 * GIB), 0.8 * GIB, 6.5 * GIB),
  }
}

function toMetrics(w: Walk): LiveMetrics {
  return {
    at: new Date().toISOString(),
    cpuLoad: Math.round(w.cpuLoad * 10) / 10,
    cpuClockMHz: Math.round(w.cpuClockMHz),
    memUsedBytes: Math.round(w.memUsedBytes),
    memTotalBytes: 32 * GIB,
    gpuLoad: Math.round(w.gpuLoad * 10) / 10,
    gpuMemUsedBytes: Math.round(w.gpuMemUsedBytes),
  }
}

export function createMetricsTicker() {
  const listeners = new Set<(m: LiveMetrics) => void>()
  let walk: Walk = { cpuLoad: 23, cpuClockMHz: 4010, memUsedBytes: 9.8 * GIB, gpuLoad: 41, gpuMemUsedBytes: 2.1 * GIB }
  let timer: ReturnType<typeof setInterval> | null = null

  const emit = (): void => {
    walk = step(walk)
    const metrics = toMetrics(walk)
    listeners.forEach((cb) => cb(metrics))
  }

  return {
    subscribe(cb: (m: LiveMetrics) => void): () => void {
      const wrapped = (m: LiveMetrics): void => cb(m)
      listeners.add(wrapped)
      if (timer === null) timer = setInterval(emit, TICK_MS)
      setTimeout(() => {
        if (listeners.has(wrapped)) wrapped(toMetrics(walk))
      }, 0)
      return () => {
        listeners.delete(wrapped)
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer)
          timer = null
        }
      }
    },
  }
}
