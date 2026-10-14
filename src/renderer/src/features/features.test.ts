import { describe, expect, it } from 'vitest'
import type { Tweak, TweakAction } from '@shared/catalog'
import type { TweakState } from '@shared/types'
import { MOCK_HEALTH, mockSystemInfo } from '../mock/data'
import { describeApply, describeDefault, describeSnapshot, formatRegValue } from './describe'
import { EMPTY_FILTER, categoryCounts, filterTweaks, isOn, matchesQuery, pendingChanges } from './filters'
import { buildReport } from './report'
import { computeScore } from './score'

const tweak = (id: string, over: Partial<Tweak> = {}): Tweak => ({
  id,
  title: `Title ${id}`,
  description: `Description ${id}`,
  category: 'power',
  risk: 'safe',
  impact: 'low',
  impactNote: '',
  recommended: false,
  recommendReason: '',
  sideEffects: '',
  requiresReboot: false,
  sources: [],
  actions: [{ type: 'powerScheme', scheme: 'ultimate' }],
  ...over,
})

const states = (entries: [string, TweakState['state']][]): Map<string, TweakState> => new Map(entries.map(([id, state]) => [id, { id, state }]))

describe('filters', () => {
  const tweaks = [
    tweak('a', { category: 'power', risk: 'safe', recommended: true }),
    tweak('b', { category: 'privacy', risk: 'moderate', title: 'Turn off Cortana' }),
    tweak('c', { category: 'privacy', risk: 'advanced', recommended: true }),
  ]

  it('filters by category, risk, recommended and text', () => {
    expect(filterTweaks(tweaks, { ...EMPTY_FILTER, category: 'privacy' }).map((t) => t.id)).toEqual(['b', 'c'])
    expect(filterTweaks(tweaks, { ...EMPTY_FILTER, risk: 'advanced' }).map((t) => t.id)).toEqual(['c'])
    expect(filterTweaks(tweaks, { ...EMPTY_FILTER, recommendedOnly: true }).map((t) => t.id)).toEqual(['a', 'c'])
    expect(matchesQuery(tweaks[1] as Tweak, '  cortana ')).toBe(true)
    expect(matchesQuery(tweaks[0] as Tweak, 'cortana')).toBe(false)
  })

  it('counts categories under the other filters, with All first', () => {
    expect(categoryCounts(tweaks, { ...EMPTY_FILTER, recommendedOnly: true })).toEqual([
      { id: 'all', count: 2 },
      { id: 'power', count: 1 },
      { id: 'privacy', count: 1 },
    ])
  })

  it('splits staged toggles into apply and revert, ignoring no-ops and not-applicable tweaks', () => {
    const s = states([
      ['on', 'applied'],
      ['off', 'not-applied'],
      ['half', 'partial'],
      ['na', 'not-applicable'],
    ])
    expect(isOn(s.get('on'))).toBe(true)
    expect(isOn(s.get('half'))).toBe(false)
    expect(pendingChanges({ on: false, off: true, half: true, na: true }, s)).toEqual({ apply: ['off', 'half'], revert: ['on'] })
    expect(pendingChanges({ on: true, off: false }, s)).toEqual({ apply: [], revert: [] })
    expect(pendingChanges({ half: false }, s)).toEqual({ apply: [], revert: ['half'] })
  })
})

describe('computeScore', () => {
  const tweaks = [
    tweak('high', { recommended: true, impact: 'high' }),
    tweak('med', { recommended: true, impact: 'medium' }),
    tweak('low', { recommended: true, impact: 'low' }),
    tweak('na', { recommended: true, impact: 'high' }),
    tweak('extra', { recommended: false, impact: 'high' }),
  ]

  it('weights recommended tweaks by impact, counts partial as half and skips not-applicable ones', () => {
    const s = states([
      ['high', 'applied'],
      ['med', 'partial'],
      ['low', 'not-applied'],
      ['na', 'not-applicable'],
      ['extra', 'applied'],
    ])
    const score = computeScore(tweaks, s, true)
    expect(score.total).toBe(3)
    expect(score.applied).toBe(1)
    expect(score.percent).toBe(Math.round(((3 + 1) / 6) * 100))
    expect(score.pending.map((t) => t.id)).toEqual(['med', 'low'])
  })

  it('is unknown until states load and 100% when nothing is recommended', () => {
    expect(computeScore(tweaks, new Map(), false).percent).toBeNull()
    expect(computeScore([tweak('x')], new Map(), true).percent).toBe(100)
  })
})

describe('describe', () => {
  const reg: TweakAction = { type: 'registry', hive: 'HKCU', path: 'Control Panel\\Desktop', name: 'MenuShowDelay', valueType: 'REG_SZ', value: '100', default: '400' }

  it('formats registry values readably', () => {
    expect(formatRegValue(null)).toBe('(not set)')
    expect(formatRegValue('100')).toBe('"100"')
    expect(formatRegValue(4294967295)).toBe('4294967295 (0xFFFFFFFF)')
    expect(formatRegValue(['a', 'b'])).toBe('"a", "b"')
  })

  it('says exactly what applying and reverting do', () => {
    expect(describeApply(reg)).toBe('Set MenuShowDelay = "100" in HKCU\\Control Panel\\Desktop')
    expect(describeDefault(reg)).toBe('Set MenuShowDelay back to "400" in HKCU\\Control Panel\\Desktop')
    expect(describeDefault({ ...reg, default: null })).toBe('Remove MenuShowDelay from HKCU\\Control Panel\\Desktop')
    expect(describeApply({ type: 'service', name: 'SysMain', startType: 'AutomaticDelayed', default: 'Automatic' })).toBe('Set the SysMain service to Automatic (delayed start)')
    expect(describeApply({ type: 'powercfg', subgroup: 's', setting: '893DEE8E-2BEF-41E0-89C6-B55D0929964C', ac: 100, dc: 5, defaultAc: 5, defaultDc: 5, hidden: false })).toMatch(/^Minimum processor state: 100 when plugged in, 5 on battery/)
    expect(describeApply({ type: 'command', apply: 'Disable-MMAgent -MemoryCompression', revert: 'x', detect: 'y' })).toBe('Run: Disable-MMAgent -MemoryCompression')
  })

  it('describes saved values', () => {
    expect(describeSnapshot({ kind: 'registry', exists: false, valueType: null, value: null })).toBe('(not set)')
    expect(describeSnapshot({ kind: 'service', exists: true, startType: 'Manual' })).toBe('Manual')
    expect(describeSnapshot({ kind: 'scheduledTask', exists: true, enabled: false })).toBe('Disabled')
    expect(describeSnapshot({ kind: 'powerScheme', activeGuid: 'g', activeName: 'Balanced', isUltimate: false })).toBe('Balanced')
  })
})

describe('buildReport', () => {
  it('summarizes the scan for the clipboard', () => {
    const text = buildReport({ info: mockSystemInfo(new Date('2026-10-10T12:00:00Z')), health: MOCK_HEALTH })
    expect(text).toContain('CPU        Intel(R) Core(TM) i7-7700 CPU @ 3.60GHz (4 cores / 8 threads)')
    expect(text).toContain('GPU        NVIDIA GeForce GTX 1070, driver 582.53, 8 GB')
    expect(text).toContain('Memory     32 GB, 2 module(s) at 2400 MT/s (rated 3200)')
    expect(text).toContain('Display    1920 x 1080 @ 239 Hz')
    expect(text).toContain('[FIX] Power plan: Balanced')
  })
})
