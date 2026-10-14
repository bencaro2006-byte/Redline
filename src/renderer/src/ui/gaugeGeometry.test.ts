import { describe, expect, it } from 'vitest'
import { clampPercent, gaugeTicks, trackDash, valueDash } from './gaugeGeometry'

describe('tach gauge geometry', () => {
  it('matches the tick positions drawn in Main.dc.html', () => {
    const ticks = gaugeTicks()
    expect(ticks).toHaveLength(11)
    expect(ticks[0]).toMatchObject({ x1: 27.2, y1: 172.8, x2: 22.9, y2: 177.1, redline: false })
    expect(ticks[5]).toMatchObject({ x1: 100, y1: -3, x2: 100, y2: -9 })
    expect(ticks.filter((t) => t.redline)).toHaveLength(2)
    expect(ticks[10]).toMatchObject({ x1: 172.8, y1: 172.8, redline: true })
  })

  it('maps percent to a 270-degree dash', () => {
    expect(trackDash()).toBe('414.7 552.9')
    expect(valueDash(0)).toBe('0.0 552.9')
    expect(valueDash(100)).toBe('414.7 552.9')
    expect(valueDash(250)).toBe('414.7 552.9')
    expect(clampPercent(Number.NaN)).toBe(0)
  })
})
