// Pure helpers that turn per-action invoke results into per-tweak report rows.
import type { Tweak } from '@shared/catalog'
import type { ApplyItemResult, BackupItem } from '@shared/types'
import { groupByTweak, tweakIdOfKey } from './plan'
import type { InvokeResult } from './types'

export function itemResultsForTweaks(
  results: readonly InvokeResult[],
  requiresReboot: (tweakId: string) => boolean,
  dryRun: boolean,
): ApplyItemResult[] {
  return [...groupByTweak(results)].map(([tweakId, rows]) => {
    const failed = rows.find((r) => !r.ok)
    const changed = rows.some((r) => r.changed)
    return {
      tweakId,
      ok: failed === undefined,
      changed,
      ...(failed?.error !== undefined ? { error: failed.error } : failed !== undefined ? { error: 'Failed' } : {}),
      requiresReboot: changed && requiresReboot(tweakId),
      dryRun,
    }
  })
}

/** A failed row for a tweak that was never attempted (e.g. its current state could not be read). */
export function skippedResult(tweakId: string, error: string, dryRun: boolean): ApplyItemResult {
  return { tweakId, ok: false, changed: false, error, requiresReboot: false, dryRun }
}

/** Copies the GUID of a power plan created during apply into the journaled "before" snapshot. */
export function withCreatedGuids(items: readonly BackupItem[], results: readonly InvokeResult[]): BackupItem[] {
  const created = new Map(results.filter((r) => typeof r.createdGuid === 'string').map((r) => [r.key, r.createdGuid as string]))
  return items.map((item) => {
    const guid = created.get(item.key)
    if (guid === undefined || item.before.kind !== 'powerScheme') return item
    return { ...item, before: { ...item.before, createdGuid: guid } }
  })
}

export function applyLabel(tweaks: readonly Tweak[]): string {
  const [first] = tweaks
  if (tweaks.length === 1 && first !== undefined) return `Applied: ${first.title}`
  return `Applied ${tweaks.length} optimizations`
}

export function rebootNeeded(rows: readonly ApplyItemResult[]): boolean {
  return rows.some((r) => r.ok && r.requiresReboot)
}

export { tweakIdOfKey }
