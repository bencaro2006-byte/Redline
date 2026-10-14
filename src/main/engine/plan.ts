// Pure planning helpers (no IO): action keys, apply/revert item lists, ordering,
// default snapshots and journal lookups.
// Ordering rule: powerScheme actions first (later powercfg actions then land on the
// newly active plan), everything else in catalog order; revert runs in reverse.
import type { Tweak, TweakAction } from '@shared/catalog'
import type { BackupEntry, Snapshot } from '@shared/types'
import { sameTarget } from './targets'
import type { InvokeItem, ProbeItem } from './types'

/** Windows' default power plan, used when no journaled plan exists to go back to. */
export const BALANCED_SCHEME_GUID = '381b4222-f694-41f0-9685-ff5bb260df2e'

/** Stable key for action `index` of tweak `tweakId`, e.g. "game-mode-on#0". */
export function actionKey(tweakId: string, index: number): string {
  return `${tweakId}#${index}`
}

/** The tweak id part of an action key ("game-mode-on#0" -> "game-mode-on"). */
export function tweakIdOfKey(key: string): string {
  const hash = key.lastIndexOf('#')
  return hash === -1 ? key : key.slice(0, hash)
}

export function probeItemsFor(tweaks: readonly Tweak[]): ProbeItem[] {
  return tweaks.flatMap((tweak) => tweak.actions.map((action, index) => ({ key: actionKey(tweak.id, index), action })))
}

const isPowerScheme = (item: { action: TweakAction }): boolean => item.action.type === 'powerScheme'

/** Stable partition: power plan switches first, then everything else in original order. */
export function orderForApply<T extends { action: TweakAction }>(items: readonly T[]): T[] {
  return [...items.filter(isPowerScheme), ...items.filter((item) => !isPowerScheme(item))]
}

/** 'set' items for every action of `tweaks`, ordered for apply. */
export function buildApplyItems(tweaks: readonly Tweak[]): InvokeItem[] {
  return orderForApply(probeItemsFor(tweaks).map((item) => ({ key: item.key, op: 'set' as const, action: item.action })))
}

/** What "Windows default" means for an action when no journaled snapshot exists. */
export function defaultSnapshot(action: TweakAction): Snapshot {
  switch (action.type) {
    case 'registry':
      return action.default === null
        ? { kind: 'registry', exists: false, valueType: null, value: null }
        : { kind: 'registry', exists: true, valueType: action.valueType, value: action.default }
    case 'service':
      return { kind: 'service', exists: true, startType: action.default }
    case 'scheduledTask':
      return { kind: 'scheduledTask', exists: true, enabled: action.defaultEnabled }
    case 'powercfg':
      return { kind: 'powercfg', exists: true, ac: action.defaultAc, dc: action.defaultDc, schemeGuid: 'SCHEME_CURRENT' }
    case 'powerScheme':
      return { kind: 'powerScheme', activeGuid: BALANCED_SCHEME_GUID, activeName: 'Balanced', isUltimate: false }
    case 'command':
      return { kind: 'command', detected: false }
  }
}

/**
 * 'restore' items for every action of `tweaks`, in reverse apply order. Uses the
 * journal's "before" snapshot for a key when present, else the catalog defaults.
 */
export function buildRevertItems(tweaks: readonly Tweak[], journal: ReadonlyMap<string, Snapshot>): InvokeItem[] {
  const ordered = orderForApply(probeItemsFor(tweaks))
  return ordered
    .map((item) => ({ key: item.key, op: 'restore' as const, action: item.action, restore: journal.get(item.key) ?? defaultSnapshot(item.action) }))
    .reverse()
}

/**
 * The original ("before Redline touched it") snapshot per action key. For each key it
 * takes the OLDEST entry that has not been reverted (its "before" predates every later
 * Redline change); when every entry with that key was reverted it falls back to the
 * newest one. `entries` may be in any order. An item is only used when its recorded
 * action still points at the same setting as `currentAction(key)` (catalog versions can
 * reorder actions, which would otherwise restore a value into the wrong setting).
 */
export function journalForKeys(
  entries: readonly BackupEntry[],
  keys: ReadonlySet<string>,
  currentAction: (key: string) => TweakAction | undefined,
): Map<string, Snapshot> {
  const byAge = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const journal = new Map<string, Snapshot>()
  const usable = (item: BackupEntry['items'][number]): boolean => {
    const action = currentAction(item.key)
    return action !== undefined && action.type === item.before.kind && sameTarget(action, item.action)
  }
  const pick = (candidates: readonly BackupEntry[]): void => {
    candidates.forEach((entry) =>
      entry.items.forEach((item) => {
        if (keys.has(item.key) && !journal.has(item.key) && usable(item)) journal.set(item.key, item.before)
      }),
    )
  }
  pick(byAge.filter((e) => e.revertedAt === null))
  pick([...byAge].reverse())
  return journal
}

/** Groups per-key results into per-tweak buckets, preserving first-seen order. */
export function groupByTweak<T extends { key: string }>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  items.forEach((item) => {
    const id = tweakIdOfKey(item.key)
    groups.set(id, [...(groups.get(id) ?? []), item])
  })
  return groups
}
