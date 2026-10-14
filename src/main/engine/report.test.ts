import { describe, expect, it } from 'vitest'
import type { BackupItem } from '@shared/types'
import { applyLabel, itemResultsForTweaks, rebootNeeded, skippedResult, withCreatedGuids } from './report'
import { getTweak } from '../catalog'

describe('itemResultsForTweaks', () => {
  it('folds action rows into one row per tweak', () => {
    const rows = itemResultsForTweaks(
      [
        { key: 'a#0', ok: true, changed: false },
        { key: 'a#1', ok: true, changed: true },
        { key: 'b#0', ok: false, changed: false, error: 'denied' },
        { key: 'c#0', ok: true, changed: false },
      ],
      (id) => id !== 'c',
      false,
    )
    expect(rows).toEqual([
      { tweakId: 'a', ok: true, changed: true, requiresReboot: true, dryRun: false },
      { tweakId: 'b', ok: false, changed: false, error: 'denied', requiresReboot: false, dryRun: false },
      { tweakId: 'c', ok: true, changed: false, requiresReboot: false, dryRun: false },
    ])
  })

  it('only needs a reboot when something actually changed and succeeded', () => {
    expect(rebootNeeded([skippedResult('x', 'err', false)])).toBe(false)
    expect(rebootNeeded([{ tweakId: 'y', ok: true, changed: true, requiresReboot: true, dryRun: false }])).toBe(true)
  })
})

describe('withCreatedGuids', () => {
  it('stores a created plan GUID only on powerScheme snapshots', () => {
    const items: BackupItem[] = [
      { key: 'p#0', action: { type: 'powerScheme', scheme: 'ultimate' }, before: { kind: 'powerScheme', activeGuid: '381b4222-f694-41f0-9685-ff5bb260df2e', activeName: 'Balanced', isUltimate: false } },
      { key: 'r#0', action: { type: 'command', apply: 'a', revert: 'r', detect: 'd' }, before: { kind: 'command', detected: false } },
    ]
    const out = withCreatedGuids(items, [
      { key: 'p#0', ok: true, changed: true, createdGuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
      { key: 'r#0', ok: true, changed: true, createdGuid: 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee' },
    ])
    expect(out[0]?.before).toMatchObject({ createdGuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
    expect(out[1]).toBe(items[1])
  })

  it('returns the same objects when nothing was created', () => {
    const items: BackupItem[] = [{ key: 'r#0', action: { type: 'command', apply: 'a', revert: 'r', detect: 'd' }, before: { kind: 'command', detected: false } }]
    expect(withCreatedGuids(items, [{ key: 'r#0', ok: true, changed: true }])[0]).toBe(items[0])
  })
})

describe('applyLabel', () => {
  it('names a single tweak and counts several', () => {
    const one = getTweak('menu-show-delay-short')
    expect(one).toBeDefined()
    if (one) {
      expect(applyLabel([one])).toBe(`Applied: ${one.title}`)
      expect(applyLabel([one, one])).toBe('Applied 2 optimizations')
    }
  })
})
