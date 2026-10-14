// applyTweaks(): restore point (optional) -> probe "before" -> journal -> invoke -> report.
// mode 'revert' puts the tweaks back to their original (journaled) state, or to the
// catalog defaults when Redline never changed them.
import type { ApplyTweaksReq } from '@shared/api'
import type { Tweak } from '@shared/catalog'
import type { ApplyItemResult, ApplyReport, BackupEntry, BackupItem, RestorePointResult, Snapshot } from '@shared/types'
import { catalogActionForKey, getTweak } from '../catalog'
import { IpcError } from '../ipc/errors'
import { getBackupStore } from './backups'
import { invalidateDetectCache } from './detect'
import { actionStatus } from './evaluate'
import { invoke } from './invoke'
import { buildApplyItems, buildRevertItems, journalForKeys, probeItemsFor, tweakIdOfKey } from './plan'
import { probeDetailed } from './probe'
import { applyLabel, itemResultsForTweaks, rebootNeeded, skippedResult, withCreatedGuids } from './report'
import { createRestorePoint, RESTORE_POINT_DESCRIPTION } from './restorePoint'
import type { ApplyOptions, EngineDeps, InvokeItem, InvokeResult } from './types'

export function defaultDeps(dryRun: boolean): EngineDeps {
  return {
    probe: probeDetailed,
    invoke,
    store: getBackupStore(),
    createRestorePoint: () => createRestorePoint(RESTORE_POINT_DESCRIPTION, { dryRun }),
    afterChange: invalidateDetectCache,
  }
}

function resolveTweaks(ids: readonly string[]): Tweak[] {
  return ids.map((id) => {
    const tweak = getTweak(id)
    if (tweak === undefined) throw new IpcError('NOT_FOUND', `Unknown optimization: ${id}`)
    return tweak
  })
}

const requiresRebootFor = (tweakId: string): boolean => getTweak(tweakId)?.requiresReboot ?? false

async function safeRestorePoint(deps: EngineDeps): Promise<RestorePointResult> {
  try {
    return await deps.createRestorePoint()
  } catch (err) {
    // Never block the change on a restore point: the journal still allows a full revert.
    const message = err instanceof Error ? err.message : String(err)
    return { created: false, skippedRecent: false, latestCreatedAt: null, warning: `No restore point: ${message}` }
  }
}

/** Splits tweaks into those whose every setting could be read and those that could not. */
function splitReadable(tweaks: readonly Tweak[], snapshots: ReadonlyMap<string, Snapshot>, errors: ReadonlyMap<string, string>) {
  const ready: Tweak[] = []
  const unreadable: { tweak: Tweak; error: string }[] = []
  tweaks.forEach((tweak) => {
    const missing = probeItemsFor([tweak])
      .map((i) => i.key)
      .find((k) => !snapshots.has(k))
    if (missing === undefined) ready.push(tweak)
    else unreadable.push({ tweak, error: `Could not read the current setting, so nothing was changed. ${errors.get(missing) ?? ''}`.trim() })
  })
  return { ready, unreadable }
}

const journalItems = (items: readonly InvokeItem[], before: ReadonlyMap<string, Snapshot>): BackupItem[] =>
  items.map((item) => ({ key: item.key, action: item.action, before: before.get(item.key) as Snapshot }))

/**
 * Runs the power plan switch first. When the plan actually changes, the power settings in
 * the same batch are re-read on the NEW plan (that is where they will be written), and the
 * journal is updated with those values before anything else is touched.
 */
async function invokeInPlanOrder(
  items: readonly InvokeItem[],
  before: Map<string, Snapshot>,
  entry: BackupEntry | null,
  options: ApplyOptions,
  deps: EngineDeps,
): Promise<InvokeResult[]> {
  const planItems = items.filter((i) => i.action.type === 'powerScheme')
  let rest = items.filter((i) => i.action.type !== 'powerScheme')
  const planResults = planItems.length > 0 ? await deps.invoke(planItems, options.dryRun) : []
  const results = [...planResults]

  const switched = !options.dryRun && planResults.some((r) => r.ok && r.changed)
  if (switched) {
    const powerItems = rest.filter((i) => i.action.type === 'powercfg')
    if (powerItems.length > 0) {
      const reprobe = await deps.probe(powerItems.map((i) => ({ key: i.key, action: i.action })))
      reprobe.snapshots.forEach((snapshot, key) => before.set(key, snapshot))
      const unreadable = new Set(powerItems.filter((i) => !reprobe.snapshots.has(i.key)).map((i) => i.key))
      rest = rest.filter((i) => !unreadable.has(i.key))
      results.push(...[...unreadable].map((key) => ({ key, ok: false, changed: false, error: 'Could not read this setting on the new power plan, so it was not changed.' })))
    }
    // Record the new "before" values and any power plan Redline created before going on.
    if (entry !== null) await deps.store.updateEntry(entry.id, { items: withCreatedGuids(journalItems(items, before), planResults) })
  }
  if (rest.length > 0) results.push(...(await deps.invoke(rest, options.dryRun)))
  return results
}

/** Keeps only journal items that really changed; removes the entry when nothing did. */
async function finalizeJournal(entry: BackupEntry, items: readonly InvokeItem[], before: ReadonlyMap<string, Snapshot>, results: readonly InvokeResult[], deps: EngineDeps): Promise<string | null> {
  const changed = new Set(results.filter((r) => r.ok && r.changed).map((r) => r.key))
  const kept = withCreatedGuids(journalItems(items, before), results).filter((item) => changed.has(item.key))
  if (kept.length === 0) {
    await deps.store.remove(entry.id)
    return null
  }
  const tweakIds = [...new Set(kept.map((item) => tweakIdOfKey(item.key)))]
  const tweaks = tweakIds.map((id) => getTweak(id)).filter((t): t is Tweak => t !== undefined)
  await deps.store.updateEntry(entry.id, { items: kept, tweakIds, label: applyLabel(tweaks) })
  return entry.id
}

async function applyMode(tweaks: readonly Tweak[], options: ApplyOptions, deps: EngineDeps): Promise<ApplyReport> {
  const progress = (message: string, done: number): void => options.onProgress?.({ task: 'apply', message, done, total: 3 })

  let restorePoint: RestorePointResult | null = null
  if (options.restorePoint && !options.dryRun) {
    progress('Creating a restore point', 0)
    restorePoint = await safeRestorePoint(deps)
  }

  progress('Reading current settings', 1)
  const { snapshots, errors } = await deps.probe(probeItemsFor(tweaks))
  const { ready, unreadable } = splitReadable(tweaks, snapshots, errors)
  const items = buildApplyItems(ready)
  const before = new Map(snapshots)

  // The journal is written BEFORE anything changes, so a crash mid-way can still be undone.
  let entry: BackupEntry | null = null
  if (!options.dryRun && items.length > 0) {
    entry = await deps.store.append({ kind: 'tweaks', label: applyLabel(ready), tweakIds: ready.map((t) => t.id), items: journalItems(items, before) })
  }

  progress(options.dryRun ? `Simulating ${ready.length} optimizations` : `Applying ${ready.length} optimizations`, 2)
  let results: InvokeResult[]
  let backupId: string | null = null
  try {
    results = await invokeInPlanOrder(items, before, entry, options, deps)
    if (entry !== null) backupId = await finalizeJournal(entry, items, before, results, deps)
  } finally {
    if (!options.dryRun) deps.afterChange()
  }
  progress('Done', 3)

  const rows = [
    ...itemResultsForTweaks(results, requiresRebootFor, options.dryRun),
    ...unreadable.map((u) => skippedResult(u.tweak.id, u.error, options.dryRun)),
  ]
  return { backupId, restorePoint, results: rows, rebootRequired: rebootNeeded(rows) }
}

async function revertMode(tweaks: readonly Tweak[], options: ApplyOptions, deps: EngineDeps): Promise<ApplyReport> {
  const progress = (message: string, done: number): void => options.onProgress?.({ task: 'revert', message, done, total: 2 })
  progress('Reading backups', 0)
  const entries = await deps.store.list()
  const all = probeItemsFor(tweaks)
  const journal = journalForKeys(entries, new Set(all.map((i) => i.key)), catalogActionForKey)

  // Without a saved value, only put back settings that are at Redline's target: anything else
  // is the user's own choice and stays as it is.
  const unjournaled = all.filter((i) => !journal.has(i.key))
  const current = unjournaled.length > 0 ? (await deps.probe(unjournaled)).snapshots : new Map<string, Snapshot>()
  const items = buildRevertItems(tweaks, journal).filter((i) => journal.has(i.key) || actionStatus(i.action, current.get(i.key)) === 'match')

  progress(options.dryRun ? 'Simulating revert' : 'Reverting', 1)
  let rows: ApplyItemResult[]
  try {
    const results = items.length > 0 ? await deps.invoke(items, options.dryRun) : []
    const reported = itemResultsForTweaks(results, requiresRebootFor, options.dryRun)
    const seen = new Set(reported.map((r) => r.tweakId))
    // Tweaks with nothing to put back are already in their original state.
    rows = [...reported, ...tweaks.filter((t) => !seen.has(t.id)).map((t) => ({ tweakId: t.id, ok: true, changed: false, requiresReboot: false, dryRun: options.dryRun }))]

    if (!options.dryRun) {
      // An entry is fully reverted once every tweak it changed has been put back successfully.
      const revertedOk = new Set(rows.filter((r) => r.ok).map((r) => r.tweakId))
      const covered = entries.filter((e) => e.kind === 'tweaks' && e.revertedAt === null && e.tweakIds.every((id) => revertedOk.has(id)))
      for (const e of covered) await deps.store.markReverted(e.id)
    }
  } finally {
    if (!options.dryRun) deps.afterChange()
  }
  progress('Done', 2)
  return { backupId: null, restorePoint: null, results: rows, rebootRequired: rebootNeeded(rows) }
}

export async function applyTweaks(req: ApplyTweaksReq, options: ApplyOptions, deps: EngineDeps = defaultDeps(options.dryRun)): Promise<ApplyReport> {
  const tweaks = resolveTweaks(req.ids)
  return req.mode === 'apply' ? applyMode(tweaks, options, deps) : revertMode(tweaks, options, deps)
}
