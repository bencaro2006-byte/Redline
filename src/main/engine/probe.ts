// probe(): read the current state of actions via Get-TweakState.ps1 (READ-ONLY).
import type { Snapshot } from '@shared/types'
import { runScript } from '../ps/runner'
import { ProbeDataSchema } from './schemas'
import type { ProbeItem } from './types'

export interface ProbeOutcome {
  snapshots: Map<string, Snapshot>
  /** Per-key error messages for items the script could not read. */
  errors: Map<string, string>
}

/** Snapshot + error maps for every item. Items whose probe failed appear only in `errors`. */
export async function probeDetailed(items: readonly ProbeItem[]): Promise<ProbeOutcome> {
  if (items.length === 0) return { snapshots: new Map(), errors: new Map() }
  const data = await runScript('tweakState', { items }, ProbeDataSchema)
  const snapshots = new Map<string, Snapshot>()
  const errors = new Map<string, string>()
  data.results.forEach((result) => {
    if (result.snapshot !== undefined) snapshots.set(result.key, result.snapshot)
    else errors.set(result.key, result.error ?? 'Unknown probe error')
  })
  return { snapshots, errors }
}

/** Returns one Snapshot per item key. Keys whose probe failed are absent from the map. */
export async function probe(items: readonly ProbeItem[]): Promise<Map<string, Snapshot>> {
  return (await probeDetailed(items)).snapshots
}
