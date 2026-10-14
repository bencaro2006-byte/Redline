// Pure comparison of probed snapshots against catalog targets (no IO, unit-tested).
import type { RegValue, RegValueType, Tweak, TweakAction } from '@shared/catalog'
import type { Snapshot, TweakState } from '@shared/types'
import { actionKey } from './plan'

/** match = at target, differ = not at target, na = not present on this PC, unknown = could not read. */
export type ActionStatus = 'match' | 'differ' | 'na' | 'unknown'

export function regValuesEqual(valueType: RegValueType, a: RegValue | null, b: RegValue): boolean {
  if (a === null) return false
  switch (valueType) {
    case 'REG_DWORD':
    case 'REG_QWORD':
      return typeof a === 'number' && typeof b === 'number' && a === b
    case 'REG_BINARY':
      return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()
    case 'REG_MULTI_SZ':
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])
    case 'REG_SZ':
    case 'REG_EXPAND_SZ':
      return typeof a === 'string' && typeof b === 'string' && a === b
  }
}

/** Status of one action given its snapshot (undefined = the probe failed for it). */
export function actionStatus(action: TweakAction, snapshot: Snapshot | undefined): ActionStatus {
  if (snapshot === undefined || snapshot.kind !== kindOf(action)) return 'unknown'
  switch (action.type) {
    case 'registry': {
      if (snapshot.kind !== 'registry') return 'unknown'
      if (!snapshot.exists || snapshot.valueType !== action.valueType) return 'differ'
      return regValuesEqual(action.valueType, snapshot.value, action.value) ? 'match' : 'differ'
    }
    case 'service':
      if (snapshot.kind !== 'service') return 'unknown'
      if (!snapshot.exists || snapshot.startType === null) return 'na'
      return snapshot.startType === action.startType ? 'match' : 'differ'
    case 'scheduledTask':
      if (snapshot.kind !== 'scheduledTask') return 'unknown'
      if (!snapshot.exists || snapshot.enabled === null) return 'na'
      return snapshot.enabled === action.enabled ? 'match' : 'differ'
    case 'powercfg':
      if (snapshot.kind !== 'powercfg') return 'unknown'
      if (!snapshot.exists || snapshot.ac === null) return 'na'
      return snapshot.ac === action.ac && (action.dc === null || snapshot.dc === action.dc) ? 'match' : 'differ'
    case 'powerScheme':
      if (snapshot.kind !== 'powerScheme') return 'unknown'
      return snapshot.isUltimate ? 'match' : 'differ'
    case 'command':
      if (snapshot.kind !== 'command' || snapshot.detected === null) return 'unknown'
      return snapshot.detected ? 'match' : 'differ'
  }
}

function kindOf(action: TweakAction): Snapshot['kind'] {
  return action.type
}

/** true = at target, false = differs, null = cannot tell or not applicable. */
export function snapshotMatchesTarget(action: TweakAction, snapshot: Snapshot): boolean | null {
  const status = actionStatus(action, snapshot)
  return status === 'match' ? true : status === 'differ' ? false : null
}

/** Aggregates per-action statuses into one state for the tweak. */
export function classifyTweak(tweak: Tweak, snapshots: ReadonlyMap<string, Snapshot>, errors?: ReadonlyMap<string, string>): TweakState {
  const statuses = tweak.actions.map((action, index) => actionStatus(action, snapshots.get(actionKey(tweak.id, index))))
  if (statuses.includes('unknown')) {
    const firstError = tweak.actions.map((_, i) => errors?.get(actionKey(tweak.id, i))).find((e) => e !== undefined)
    return { id: tweak.id, state: 'unknown', detail: firstError ?? 'Could not read the current setting.' }
  }
  const applicable = statuses.filter((s) => s !== 'na')
  if (applicable.length === 0) return { id: tweak.id, state: 'not-applicable', detail: 'Not present on this PC.' }
  const matches = applicable.filter((s) => s === 'match').length
  if (matches === applicable.length) return { id: tweak.id, state: 'applied' }
  if (matches === 0) return { id: tweak.id, state: 'not-applied' }
  return { id: tweak.id, state: 'partial', detail: `${matches} of ${applicable.length} changes are in place.` }
}
