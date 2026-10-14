import { describe, expect, it } from 'vitest'
import type { Tweak, TweakAction } from '@shared/catalog'
import type { Snapshot } from '@shared/types'
import { actionStatus, classifyTweak, regValuesEqual, snapshotMatchesTarget } from './evaluate'

const reg = (over: Partial<Extract<TweakAction, { type: 'registry' }>> = {}): TweakAction => ({
  type: 'registry',
  hive: 'HKCU',
  path: 'Control Panel\\Mouse',
  name: 'MouseSpeed',
  valueType: 'REG_SZ',
  value: '0',
  default: '1',
  ...over,
})

const regSnap = (valueType: Snapshot extends never ? never : 'REG_SZ' | 'REG_DWORD' | 'REG_BINARY' | 'REG_MULTI_SZ' | null, value: unknown, exists = true): Snapshot =>
  ({ kind: 'registry', exists, valueType, value }) as Snapshot

const tweak = (actions: TweakAction[]): Tweak => ({
  id: 't',
  title: 'T',
  description: 'd',
  category: 'input',
  risk: 'safe',
  impact: 'low',
  impactNote: '',
  recommended: false,
  recommendReason: '',
  sideEffects: '',
  requiresReboot: false,
  sources: [],
  actions,
})

describe('regValuesEqual', () => {
  it('compares numbers, strings, binary (case-insensitive) and multi-strings', () => {
    expect(regValuesEqual('REG_DWORD', 4294967295, 4294967295)).toBe(true)
    expect(regValuesEqual('REG_DWORD', 1, 0)).toBe(false)
    expect(regValuesEqual('REG_SZ', '0', '0')).toBe(true)
    expect(regValuesEqual('REG_SZ', 'High', 'high')).toBe(false)
    expect(regValuesEqual('REG_BINARY', '9012ABCD', '9012abcd')).toBe(true)
    expect(regValuesEqual('REG_MULTI_SZ', ['a', 'b'], ['a', 'b'])).toBe(true)
    expect(regValuesEqual('REG_MULTI_SZ', ['a'], ['a', 'b'])).toBe(false)
    expect(regValuesEqual('REG_DWORD', null, 1)).toBe(false)
  })

  it('never treats a string and a number as equal', () => {
    expect(regValuesEqual('REG_SZ', 0 as unknown as string, '0')).toBe(false)
  })
})

describe('actionStatus', () => {
  it('matches a registry value with the same type and data', () => {
    expect(actionStatus(reg(), regSnap('REG_SZ', '0'))).toBe('match')
  })

  it('reports a type mismatch as differ (KeyboardDelay stored as DWORD 0 instead of REG_SZ "0")', () => {
    expect(actionStatus(reg(), regSnap('REG_DWORD', 0))).toBe('differ')
  })

  it('reports a missing value as differ', () => {
    expect(actionStatus(reg(), regSnap(null, null, false))).toBe('differ')
  })

  it('is unknown when the probe failed or returned the wrong kind', () => {
    expect(actionStatus(reg(), undefined)).toBe('unknown')
    expect(actionStatus(reg(), { kind: 'command', detected: true })).toBe('unknown')
  })

  it('treats a missing service or task as not applicable', () => {
    const svc: TweakAction = { type: 'service', name: 'SysMain', startType: 'Disabled', default: 'Automatic' }
    expect(actionStatus(svc, { kind: 'service', exists: false, startType: null })).toBe('na')
    expect(actionStatus(svc, { kind: 'service', exists: true, startType: 'Disabled' })).toBe('match')
    expect(actionStatus(svc, { kind: 'service', exists: true, startType: 'AutomaticDelayed' })).toBe('differ')
    const task: TweakAction = { type: 'scheduledTask', path: '\\A\\B', enabled: false, defaultEnabled: true }
    expect(actionStatus(task, { kind: 'scheduledTask', exists: false, enabled: null })).toBe('na')
    expect(actionStatus(task, { kind: 'scheduledTask', exists: true, enabled: false })).toBe('match')
  })

  it('compares powercfg AC always and DC only when the action sets it', () => {
    const base = { type: 'powercfg' as const, subgroup: 'a', setting: 'b', defaultAc: 5, defaultDc: 5, hidden: false }
    const snap = (ac: number, dc: number): Snapshot => ({ kind: 'powercfg', exists: true, ac, dc, schemeGuid: 'SCHEME_CURRENT' })
    expect(actionStatus({ ...base, ac: 100, dc: 5 }, snap(100, 5))).toBe('match')
    expect(actionStatus({ ...base, ac: 100, dc: 5 }, snap(100, 100))).toBe('differ')
    expect(actionStatus({ ...base, ac: 100, dc: null }, snap(100, 1))).toBe('match')
  })

  it('uses isUltimate for the power plan and detected for commands', () => {
    const plan: TweakAction = { type: 'powerScheme', scheme: 'ultimate' }
    expect(actionStatus(plan, { kind: 'powerScheme', activeGuid: 'x', activeName: 'Balanced', isUltimate: false })).toBe('differ')
    expect(actionStatus(plan, { kind: 'powerScheme', activeGuid: 'x', activeName: 'Ultimate Performance', isUltimate: true })).toBe('match')
    const cmd: TweakAction = { type: 'command', apply: 'a', revert: 'r', detect: 'd' }
    expect(actionStatus(cmd, { kind: 'command', detected: true })).toBe('match')
    expect(actionStatus(cmd, { kind: 'command', detected: null })).toBe('unknown')
  })

  it('snapshotMatchesTarget maps statuses to true / false / null', () => {
    expect(snapshotMatchesTarget(reg(), regSnap('REG_SZ', '0'))).toBe(true)
    expect(snapshotMatchesTarget(reg(), regSnap('REG_SZ', '1'))).toBe(false)
    expect(snapshotMatchesTarget({ type: 'service', name: 'X', startType: 'Manual', default: 'Manual' }, { kind: 'service', exists: false, startType: null })).toBe(null)
  })
})

describe('classifyTweak', () => {
  const two = tweak([reg(), reg({ name: 'MouseThreshold1' })])

  it('is applied when every applicable action matches', () => {
    const snaps = new Map<string, Snapshot>([
      ['t#0', regSnap('REG_SZ', '0')],
      ['t#1', regSnap('REG_SZ', '0')],
    ])
    expect(classifyTweak(two, snaps).state).toBe('applied')
  })

  it('is partial when only some match, with a count in the detail', () => {
    const snaps = new Map<string, Snapshot>([
      ['t#0', regSnap('REG_SZ', '0')],
      ['t#1', regSnap('REG_SZ', '6')],
    ])
    expect(classifyTweak(two, snaps)).toEqual({ id: 't', state: 'partial', detail: '1 of 2 changes are in place.' })
  })

  it('is not-applied when none match', () => {
    const snaps = new Map<string, Snapshot>([
      ['t#0', regSnap('REG_SZ', '1')],
      ['t#1', regSnap('REG_SZ', '6')],
    ])
    expect(classifyTweak(two, snaps).state).toBe('not-applied')
  })

  it('is unknown when any probe failed, carrying the probe error', () => {
    const snaps = new Map<string, Snapshot>([['t#0', regSnap('REG_SZ', '0')]])
    const errors = new Map([['t#1', 'Access is denied.']])
    expect(classifyTweak(two, snaps, errors)).toEqual({ id: 't', state: 'unknown', detail: 'Access is denied.' })
  })

  it('is not-applicable when nothing it touches exists here', () => {
    const svcTweak = tweak([{ type: 'service', name: 'XblAuthManager', startType: 'Disabled', default: 'Manual' }])
    const snaps = new Map<string, Snapshot>([['t#0', { kind: 'service', exists: false, startType: null }]])
    expect(classifyTweak(svcTweak, snaps).state).toBe('not-applicable')
  })

  it('ignores not-applicable actions when the rest match', () => {
    const mixed = tweak([reg(), { type: 'scheduledTask', path: '\\X\\Y', enabled: false, defaultEnabled: true }])
    const snaps = new Map<string, Snapshot>([
      ['t#0', regSnap('REG_SZ', '0')],
      ['t#1', { kind: 'scheduledTask', exists: false, enabled: null }],
    ])
    expect(classifyTweak(mixed, snaps).state).toBe('applied')
  })
})
