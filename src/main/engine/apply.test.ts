import { describe, expect, it, vi } from 'vitest'
import type { BackupEntry, BackupItem, RestorePointResult, Snapshot } from '@shared/types'
import { applyTweaks } from './apply'
import type { NewBackup } from './backups'
import { revertBackup } from './revert'
import type { EngineDeps, InvokeItem, InvokeResult, ProbeItem } from './types'

// Real catalog ids (src/main/catalog/catalog.json).
const MENU = 'menu-show-delay-short' // 1 registry action (MenuShowDelay "100", default "400"), no reboot
const PLAN = 'ultimate-performance-plan' // 1 powerScheme action
const ASPM = 'disable-pcie-aspm' // 1 powercfg action
const FAST_STARTUP = 'disable-fast-startup' // requiresReboot

const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e'
const ULTIMATE = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

interface FakeOptions {
  probeErrors?: string[]
  invokeFail?: string[]
  unchanged?: string[]
  createdGuid?: string
  restorePoint?: () => Promise<RestorePointResult>
  /** MenuShowDelay value the fake registry reports. */
  menuValue?: string
}

function fakeDeps(over: FakeOptions = {}) {
  const entries: BackupEntry[] = []
  const invoked: { items: InvokeItem[]; dryRun: boolean }[] = []
  let nextId = 1
  let activePlan = BALANCED

  const snapshotFor = (item: ProbeItem): Snapshot => {
    switch (item.action.type) {
      case 'powerScheme':
        return { kind: 'powerScheme', activeGuid: activePlan, activeName: activePlan === BALANCED ? 'Balanced' : 'Ultimate Performance', isUltimate: activePlan !== BALANCED }
      case 'powercfg':
        return { kind: 'powercfg', exists: true, ac: 1, dc: 2, schemeGuid: activePlan }
      default:
        return { kind: 'registry', exists: true, valueType: 'REG_SZ', value: item.key === `${MENU}#0` ? (over.menuValue ?? 'before') : 'before' }
    }
  }

  const deps: EngineDeps = {
    probe: vi.fn(async (items: readonly ProbeItem[]) => ({
      snapshots: new Map(items.filter((i) => !over.probeErrors?.includes(i.key)).map((i) => [i.key, snapshotFor(i)])),
      errors: new Map((over.probeErrors ?? []).map((k) => [k, 'Access is denied.'])),
    })),
    invoke: vi.fn(async (items: readonly InvokeItem[], dryRun: boolean): Promise<InvokeResult[]> => {
      invoked.push({ items: [...items], dryRun })
      return items.map((i) => {
        if (over.invokeFail?.includes(i.key)) return { key: i.key, ok: false, changed: false, error: 'boom' }
        if (over.unchanged?.includes(i.key)) return { key: i.key, ok: true, changed: false }
        if (i.action.type === 'powerScheme' && i.op === 'set' && !dryRun) {
          activePlan = ULTIMATE
          return { key: i.key, ok: true, changed: true, createdGuid: over.createdGuid ?? null }
        }
        return { key: i.key, ok: true, changed: true }
      })
    }),
    store: {
      list: vi.fn(async () => [...entries].reverse()),
      get: vi.fn(async (id: string) => entries.find((e) => e.id === id)),
      append: vi.fn(async (b: NewBackup) => {
        const entry: BackupEntry = { ...b, id: `b${nextId}`, createdAt: `2026-10-10T12:00:0${nextId}.000Z`, revertedAt: null }
        nextId += 1
        entries.push(entry)
        return entry
      }),
      updateEntry: vi.fn(async (id: string, patch: { items: readonly BackupItem[]; tweakIds?: readonly string[]; label?: string }) => {
        const i = entries.findIndex((e) => e.id === id)
        const current = entries[i] as BackupEntry
        const updated: BackupEntry = { ...current, items: [...patch.items], tweakIds: patch.tweakIds ? [...patch.tweakIds] : current.tweakIds, label: patch.label ?? current.label }
        entries[i] = updated
        return updated
      }),
      remove: vi.fn(async (id: string) => {
        const i = entries.findIndex((e) => e.id === id)
        if (i >= 0) entries.splice(i, 1)
      }),
      markReverted: vi.fn(async (id: string) => {
        const i = entries.findIndex((e) => e.id === id)
        const updated = { ...(entries[i] as BackupEntry), revertedAt: '2026-10-10T13:00:00.000Z' }
        entries[i] = updated
        return updated
      }),
    },
    createRestorePoint: over.restorePoint ?? vi.fn(async () => ({ created: true, skippedRecent: false, latestCreatedAt: '2026-10-10T12:00:00Z', warning: '' })),
    afterChange: vi.fn(),
  }
  return { deps, entries, invoked }
}

const OPTS = { dryRun: false, restorePoint: false } as const

describe('applyTweaks (apply)', () => {
  it('creates a restore point, journals before-snapshots BEFORE invoking, and reports per tweak', async () => {
    const { deps, entries, invoked } = fakeDeps()
    const order: string[] = []
    const realAppend = deps.store.append
    deps.store.append = vi.fn(async (b: NewBackup) => {
      order.push('journal')
      return realAppend(b)
    })
    const realInvoke = deps.invoke
    deps.invoke = vi.fn(async (items: readonly InvokeItem[], dryRun: boolean) => {
      order.push('invoke')
      return realInvoke(items, dryRun)
    })

    const report = await applyTweaks({ ids: [MENU, FAST_STARTUP], mode: 'apply' }, { dryRun: false, restorePoint: true }, deps)

    expect(deps.createRestorePoint).toHaveBeenCalledOnce()
    expect(order).toEqual(['journal', 'invoke'])
    expect(report.backupId).toBe('b1')
    expect(report.restorePoint?.created).toBe(true)
    expect(report.results.map((r) => [r.tweakId, r.ok, r.changed])).toEqual([
      [MENU, true, true],
      [FAST_STARTUP, true, true],
    ])
    expect(report.rebootRequired).toBe(true)
    expect(entries[0]?.items.map((i) => i.before)).toEqual([
      { kind: 'registry', exists: true, valueType: 'REG_SZ', value: 'before' },
      { kind: 'registry', exists: true, valueType: 'REG_SZ', value: 'before' },
    ])
    expect(invoked[0]?.dryRun).toBe(false)
    expect(deps.afterChange).toHaveBeenCalled()
  })

  it('in dry-run mode creates no restore point and no journal, and passes dryRun to the script', async () => {
    const { deps, entries, invoked } = fakeDeps()
    const report = await applyTweaks({ ids: [MENU], mode: 'apply' }, { dryRun: true, restorePoint: true }, deps)
    expect(deps.createRestorePoint).not.toHaveBeenCalled()
    expect(entries.length).toBe(0)
    expect(report.backupId).toBeNull()
    expect(invoked[0]?.dryRun).toBe(true)
    expect(report.results[0]?.dryRun).toBe(true)
    expect(deps.afterChange).not.toHaveBeenCalled()
  })

  it('does not touch a tweak whose current state could not be read', async () => {
    const { deps, invoked } = fakeDeps({ probeErrors: [`${MENU}#0`] })
    const report = await applyTweaks({ ids: [MENU, FAST_STARTUP], mode: 'apply' }, OPTS, deps)
    expect(invoked[0]?.items.map((i) => i.key)).toEqual([`${FAST_STARTUP}#0`])
    const menu = report.results.find((r) => r.tweakId === MENU)
    expect(menu).toMatchObject({ ok: false, changed: false })
    expect(menu?.error).toMatch(/Could not read the current setting/)
  })

  it('still applies when the restore point fails, and reports why', async () => {
    const { deps } = fakeDeps({ restorePoint: async () => Promise.reject(new Error('System Protection is off')) })
    const report = await applyTweaks({ ids: [MENU], mode: 'apply' }, { dryRun: false, restorePoint: true }, deps)
    expect(report.restorePoint).toMatchObject({ created: false })
    expect(report.restorePoint?.warning).toMatch(/System Protection is off/)
    expect(report.results[0]?.ok).toBe(true)
  })

  it('records the GUID of a power plan it created so revert can delete it', async () => {
    const { deps, entries } = fakeDeps({ createdGuid: ULTIMATE })
    await applyTweaks({ ids: [PLAN], mode: 'apply' }, OPTS, deps)
    expect(deps.store.updateEntry).toHaveBeenCalled()
    expect(entries[0]?.items[0]?.before).toMatchObject({ kind: 'powerScheme', activeGuid: BALANCED, createdGuid: ULTIMATE })
  })

  it('journals power settings against the NEW plan when the same batch switches plans', async () => {
    const { deps, entries, invoked } = fakeDeps({ createdGuid: ULTIMATE })
    await applyTweaks({ ids: [ASPM, PLAN], mode: 'apply' }, OPTS, deps)
    // Plan switch runs alone first, then the power setting.
    expect(invoked.map((call) => call.items.map((i) => i.key))).toEqual([[`${PLAN}#0`], [`${ASPM}#0`]])
    const aspm = entries[0]?.items.find((i) => i.key === `${ASPM}#0`)
    expect(aspm?.before).toMatchObject({ kind: 'powercfg', schemeGuid: ULTIMATE })
  })

  it('keeps only items that changed and drops the entry when nothing changed', async () => {
    const mixed = fakeDeps({ unchanged: [`${MENU}#0`] })
    const report = await applyTweaks({ ids: [MENU, FAST_STARTUP], mode: 'apply' }, OPTS, mixed.deps)
    expect(mixed.entries[0]?.items.map((i) => i.key)).toEqual([`${FAST_STARTUP}#0`])
    expect(mixed.entries[0]?.tweakIds).toEqual([FAST_STARTUP])
    expect(report.backupId).toBe('b1')

    const none = fakeDeps({ unchanged: [`${MENU}#0`] })
    const empty = await applyTweaks({ ids: [MENU], mode: 'apply' }, OPTS, none.deps)
    expect(none.entries).toEqual([])
    expect(empty.backupId).toBeNull()
    expect(empty.results[0]).toMatchObject({ ok: true, changed: false })
  })

  it('refreshes caches even when the script run fails, and keeps the journal intact', async () => {
    const { deps, entries } = fakeDeps()
    deps.invoke = vi.fn(async () => Promise.reject(new Error('timed out')))
    await expect(applyTweaks({ ids: [MENU], mode: 'apply' }, OPTS, deps)).rejects.toThrow(/timed out/)
    expect(deps.afterChange).toHaveBeenCalled()
    expect(entries[0]?.items.length).toBe(1)
  })

  it('reports failures per tweak without a reboot flag', async () => {
    const { deps } = fakeDeps({ invokeFail: [`${FAST_STARTUP}#0`] })
    const report = await applyTweaks({ ids: [FAST_STARTUP], mode: 'apply' }, OPTS, deps)
    expect(report.results[0]).toMatchObject({ ok: false, error: 'boom' })
    expect(report.rebootRequired).toBe(false)
  })

  it('rejects unknown ids', async () => {
    const { deps } = fakeDeps()
    await expect(applyTweaks({ ids: ['nope'], mode: 'apply' }, { dryRun: true, restorePoint: false }, deps)).rejects.toThrow(/Unknown optimization/)
  })
})

describe('applyTweaks (revert) and revertBackup', () => {
  it('reverts tweaks with their journaled snapshot and marks fully covered entries', async () => {
    const { deps, entries, invoked } = fakeDeps()
    await applyTweaks({ ids: [MENU], mode: 'apply' }, OPTS, deps)
    const report = await applyTweaks({ ids: [MENU], mode: 'revert' }, OPTS, deps)
    const restore = invoked[1]?.items[0]
    expect(restore?.op).toBe('restore')
    expect(restore?.restore).toEqual({ kind: 'registry', exists: true, valueType: 'REG_SZ', value: 'before' })
    expect(report.results[0]?.ok).toBe(true)
    expect(entries[0]?.revertedAt).not.toBeNull()
  })

  it('without a backup, restores the Windows default only for settings still at Redline’s value', async () => {
    const atTarget = fakeDeps({ menuValue: '100' })
    await applyTweaks({ ids: [MENU], mode: 'revert' }, OPTS, atTarget.deps)
    expect(atTarget.invoked[0]?.items[0]?.restore).toEqual({ kind: 'registry', exists: true, valueType: 'REG_SZ', value: '400' })

    const userValue = fakeDeps({ menuValue: '250' })
    const report = await applyTweaks({ ids: [MENU], mode: 'revert' }, OPTS, userValue.deps)
    expect(userValue.invoked).toEqual([])
    expect(report.results).toEqual([{ tweakId: MENU, ok: true, changed: false, requiresReboot: false, dryRun: false }])
  })

  it('ignores a journaled value whose recorded setting no longer matches the catalog action', async () => {
    const { deps, entries, invoked } = fakeDeps({ menuValue: '250' })
    entries.push({
      id: 'old',
      createdAt: '2026-01-01T00:00:00.000Z',
      tweakIds: [MENU],
      kind: 'tweaks',
      label: 'old build',
      revertedAt: null,
      items: [
        {
          key: `${MENU}#0`,
          action: { type: 'registry', hive: 'HKCU', path: 'Control Panel\\Desktop', name: 'SomethingElse', valueType: 'REG_SZ', value: '1', default: null },
          before: { kind: 'registry', exists: true, valueType: 'REG_SZ', value: 'wrong setting' },
        },
      ],
    })
    await applyTweaks({ ids: [MENU], mode: 'revert' }, OPTS, deps)
    expect(invoked).toEqual([]) // MenuShowDelay is the user's own 250: left alone, not overwritten
  })

  it('reverts one backup entry and marks it reverted only when every item succeeded', async () => {
    const ok = fakeDeps()
    const applied = await applyTweaks({ ids: [MENU, FAST_STARTUP], mode: 'apply' }, OPTS, ok.deps)
    await revertBackup(applied.backupId as string, OPTS, ok.deps)
    expect(ok.entries[0]?.revertedAt).not.toBeNull()
    expect(ok.invoked[1]?.items.map((i) => i.key)).toEqual([`${FAST_STARTUP}#0`, `${MENU}#0`])

    const failing = fakeDeps()
    const second = await applyTweaks({ ids: [FAST_STARTUP], mode: 'apply' }, OPTS, failing.deps)
    vi.mocked(failing.deps.invoke).mockResolvedValueOnce([{ key: `${FAST_STARTUP}#0`, ok: false, changed: false, error: 'denied' }])
    const report = await revertBackup(second.backupId as string, OPTS, failing.deps)
    expect(report.results[0]?.ok).toBe(false)
    expect(failing.entries[0]?.revertedAt).toBeNull()
  })

  it('throws NOT_FOUND for an unknown backup', async () => {
    const { deps } = fakeDeps()
    await expect(revertBackup('missing', { dryRun: true, restorePoint: false }, deps)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
