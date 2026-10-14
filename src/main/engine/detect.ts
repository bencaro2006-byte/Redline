// Tweak state detection: probe every action, compare with catalog targets.
// Results are cached briefly (the probe spawns PowerShell) and invalidated after changes.
import type { Tweak } from '@shared/catalog'
import type { TweakState } from '@shared/types'
import { getCatalog, getTweak } from '../catalog'
import { classifyTweak } from './evaluate'
import { probeItemsFor } from './plan'
import { probeDetailed } from './probe'

export { classifyTweak, snapshotMatchesTarget } from './evaluate'

const CACHE_TTL_MS = 30_000

let cache: { at: number; states: TweakState[] } | null = null
let inFlight: Promise<TweakState[]> | null = null

/** Call after anything that may have changed tweak state. */
export function invalidateDetectCache(): void {
  cache = null
}

async function detectAll(): Promise<TweakState[]> {
  const tweaks = getCatalog().tweaks
  const { snapshots, errors } = await probeDetailed(probeItemsFor(tweaks))
  return tweaks.map((tweak) => classifyTweak(tweak, snapshots, errors))
}

/** Detects every catalog tweak (or only `ids`). Read-only. */
export async function detectTweaks(ids?: readonly string[]): Promise<TweakState[]> {
  if (ids !== undefined) {
    const tweaks = ids.map(getTweak).filter((t): t is Tweak => t !== undefined)
    const { snapshots, errors } = await probeDetailed(probeItemsFor(tweaks))
    return tweaks.map((tweak) => classifyTweak(tweak, snapshots, errors))
  }
  if (cache !== null && Date.now() - cache.at < CACHE_TTL_MS) return cache.states
  inFlight ??= detectAll()
    .then((states) => {
      cache = { at: Date.now(), states }
      return states
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}
