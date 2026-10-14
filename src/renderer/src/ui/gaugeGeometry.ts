// Geometry for the 270-degree tachometer in design/project/Main.dc.html.
// The sweep starts at 135 degrees (bottom-left) and runs clockwise to 405 degrees.

export const GAUGE_CENTER = 100
export const GAUGE_RADIUS = 88
export const GAUGE_SWEEP_DEG = 270
export const GAUGE_START_DEG = 135
export const TICK_COUNT = 11
export const TICK_INNER_R = 103
export const TICK_OUTER_R = 109

export interface GaugeTick {
  x1: number
  y1: number
  x2: number
  y2: number
  redline: boolean
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

const circumference = 2 * Math.PI * GAUGE_RADIUS
const sweepLength = circumference * (GAUGE_SWEEP_DEG / 360)

/** stroke-dasharray for the background track (the full 270-degree arc). */
export function trackDash(): string {
  return `${sweepLength.toFixed(1)} ${circumference.toFixed(1)}`
}

/** stroke-dasharray for the value arc at `percent` (0-100). */
export function valueDash(percent: number): string {
  return `${((sweepLength * clampPercent(percent)) / 100).toFixed(1)} ${circumference.toFixed(1)}`
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/** Evenly spaced ticks; those at or past `redlineFrom` (0-1 of the sweep) are redline ticks. */
export function gaugeTicks(redlineFrom = 0.9): GaugeTick[] {
  return Array.from({ length: TICK_COUNT }, (_, i) => {
    const fraction = i / (TICK_COUNT - 1)
    const rad = ((GAUGE_START_DEG + GAUGE_SWEEP_DEG * fraction) * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    return {
      x1: round1(GAUGE_CENTER + TICK_INNER_R * cos),
      y1: round1(GAUGE_CENTER + TICK_INNER_R * sin),
      x2: round1(GAUGE_CENTER + TICK_OUTER_R * cos),
      y2: round1(GAUGE_CENTER + TICK_OUTER_R * sin),
      redline: fraction >= redlineFrom - 1e-9,
    }
  })
}
