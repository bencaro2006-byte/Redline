import { describe, expect, it } from 'vitest'
import type { Tweak, TweakAction } from '@shared/catalog'
import type { BackupEntry, Snapshot } from '@shared/types'
import {
  BALANCED_SCHEME_GUID,
  actionKey,
  buildApplyItems,
  buildRevertItems,
  defaultSnapshot,
  groupByTweak,
  journalForKeys,
  orderForApply,
  probeItemsFor,
  tweakIdOfKey,
} from './plan'

const mk = (id: string, actions: TweakAction[]): Tweak => ({
  id,
  title: id,
  description: 'd',
  category: 'power',
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

const regA: TweakAction = { type: 'registry', hive: 'HKLM', path: 'SOFTWARE\\A', name: 'V', valueType: 'REG_DWORD', value: 1, default: null }
const regB: TweakAction = { type: 'registry', hive: 'HKCU', path: 'Control Panel\\Desktop', name: 'MenuShowDelay', valueType: 'REG_SZ', value: '100', default: '400' }
const plan: TweakAction = { type: 'powerScheme', scheme: 'ultimate' }
const pcfg: TweakAction = { type: 'powercfg', subgroup: 's', setting: 'x', ac: 100, dc: 5, defaultAc: 5, defaultDc: 5, hidden: false }

describe('keys', () => {
  it('builds and splits action keys', () => {
    expect(actionKey('game-mode-on', 2)).toBe('game-mode-on#2')
    expect(tweakIdOfKey('game-mode-on#2')).toBe('game-mode-on')
    expect(tweakIdOfKey('plain')).toBe('plain')
  })

  it('lists one probe item per action', () => {
    expect(probeItemsFor([mk('a', [regA, regB]), mk('b', [plan])]).map((i) => i.key)).toEqual(['a#0', 'a#1', 'b#0'])
  })
})

describe('ordering', () => {
  it('moves power plan switches first and keeps everything else in order', () => {
    const items = [{ action: pcfg, n: 1 }, { action: regA, n: 2 }, { action: plan, n: 3 }, { action: regB, n: 4 }]
    expect(orderForApply(items).map((i) => i.n)).toEqual([3, 1, 2, 4])
  })

  it('builds set items with the plan switch first', () => {
    const items = buildApplyItems([mk('cpu', [pcfg]), mk('plan', [plan])])
    expect(items.map((i) => `${i.key}:${i.op}`)).toEqual(['plan#0:set', 'cpu#0:set'])
  })
})

describe('defaults', () => {
  it('turns catalog defaults into restore snapshots', () => {
    expect(defaultSnapshot(regA)).toEqual({ kind: 'registry', exists: false, valueType: null, value: null })
    expect(defaultSnapshot(regB)).toEqual({ kind: 'registry', exists: true, valueType: 'REG_SZ', value: '400' })
    expect(defaultSnapshot({ type: 'service', name: 'S', startType: 'Disabled', default: 'Automatic' })).toEqual({ kind: 'service', exists: true, startType: 'Automatic' })
    expect(defaultSnapshot({ type: 'scheduledTask', path: '\\A', enabled: false, defaultEnabled: true })).toEqual({ kind: 'scheduledTask', exists: true, enabled: true })
    expect(defaultSnapshot(pcfg)).toEqual({ kind: 'powercfg', exists: true, ac: 5, dc: 5, schemeGuid: 'SCHEME_CURRENT' })
    expect(defaultSnapshot(plan)).toMatchObject({ kind: 'powerScheme', activeGuid: BALANCED_SCHEME_GUID, isUltimate: false })
    expect(defaultSnapshot({ type: 'command', apply: 'a', revert: 'r', detect: 'd' })).toEqual({ kind: 'command', detected: false })
  })
})

describe('revert planning', () => {
  it('reverses apply order and prefers journaled snapshots over defaults', () => {
    const journaled: Snapshot = { kind: 'registry', exists: true, valueType: 'REG_SZ', value: '200' }
    const items = buildRevertItems([mk('cpu', [pcfg]), mk('plan', [plan]), mk('menu', [regB])], new Map([['menu#0', journaled]]))
    expect(items.map((i) => i.key)).toEqual(['menu#0', 'cpu#0', 'plan#0'])
    expect(items.every((i) => i.op === 'restore')).toBe(true)
    expect(items[0]?.restore).toEqual(journaled)
    expect(items[1]?.restore).toEqual(defaultSnapshot(pcfg))
  })
})

describe('journalForKeys', () => {
  const snap = (value: string): Snapshot => ({ kind: 'registry', exists: true, valueType: 'REG_SZ', value })
  const entry = (id: string, createdAt: string, value: string, revertedAt: string | null = null): BackupEntry => ({
    id,
    createdAt,
    tweakIds: ['menu'],
    kind: 'tweaks',
    label: id,
    revertedAt,
    items: [{ key: 'menu#0', action: regB, before: snap(value) }],
  })
  /** The catalog action currently behind each key. */
  const current = (key: string): TweakAction | undefined => (key === 'menu#0' ? regB : undefined)

  it('ignores items whose recorded setting differs from the current catalog action (catalog reordered)', () => {
    const moved = { ...entry('x', '2026-10-10T01:00:00Z', '400'), items: [{ key: 'menu#0', action: regA, before: snap('400') }] }
    expect(journalForKeys([moved], new Set(['menu#0']), current).size).toBe(0)
  })

  it('uses the oldest unreverted entry (the state before Redline first changed it)', () => {
    const journal = journalForKeys([entry('new', '2026-10-10T02:00:00Z', '100'), entry('old', '2026-10-10T01:00:00Z', '400')], new Set(['menu#0']), current)
    expect(journal.get('menu#0')).toEqual(snap('400'))
  })

  it('skips reverted entries, falling back to the newest when all were reverted', () => {
    const a = entry('a', '2026-10-10T01:00:00Z', '400', '2026-10-10T01:30:00Z')
    const b = entry('b', '2026-10-10T02:00:00Z', '250')
    expect(journalForKeys([a, b], new Set(['menu#0']), current).get('menu#0')).toEqual(snap('250'))
    const bReverted = { ...b, revertedAt: '2026-10-10T03:00:00Z' }
    expect(journalForKeys([a, bReverted], new Set(['menu#0']), current).get('menu#0')).toEqual(snap('250'))
  })

  it('ignores keys that were not asked for', () => {
    expect(journalForKeys([entry('a', '2026-10-10T01:00:00Z', '400')], new Set(['other#0']), current).size).toBe(0)
  })
})

describe('groupByTweak', () => {
  it('groups rows by the tweak id of their key, in first-seen order', () => {
    const groups = groupByTweak([{ key: 'b#0' }, { key: 'a#0' }, { key: 'b#1' }])
    expect([...groups.keys()]).toEqual(['b', 'a'])
    expect(groups.get('b')?.length).toBe(2)
  })
})
