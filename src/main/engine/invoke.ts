// invoke(): drive actions to their target ('set') or back to a snapshot ('restore')
// via Invoke-Tweaks.ps1. dryRun:true touches nothing (the script only reads).
// Defence in depth: a 'command' action runs only if its strings are byte-identical to a
// command in the bundled catalog, whatever path the item took to get here.
import { isCatalogCommand } from '../catalog'
import { runScript } from '../ps/runner'
import { InvokeDataSchema } from './schemas'
import type { InvokeItem, InvokeResult } from './types'

const REJECTED = 'Refused: this command is not part of the bundled catalog.'

export async function invoke(items: readonly InvokeItem[], dryRun: boolean): Promise<InvokeResult[]> {
  const allowed = items.filter((item) => item.action.type !== 'command' || isCatalogCommand(item.action))
  if (allowed.length === 0) return items.map((item) => ({ key: item.key, ok: false, changed: false, error: REJECTED }))

  const data = await runScript('invokeTweaks', { dryRun, items: allowed }, InvokeDataSchema)
  const byKey = new Map(data.results.map((r) => [r.key, r]))
  const allowedKeys = new Set(allowed.map((item) => item.key))
  // Every requested key gets a result, in request order, even if the script skipped one.
  return items.map((item) => {
    if (!allowedKeys.has(item.key)) return { key: item.key, ok: false, changed: false, error: REJECTED }
    const result = byKey.get(item.key)
    if (result === undefined) return { key: item.key, ok: false, changed: false, error: 'No result from Invoke-Tweaks.ps1' }
    return {
      key: result.key,
      ok: result.ok,
      changed: result.changed,
      ...(result.error !== undefined ? { error: result.error } : {}),
      ...(result.createdGuid !== undefined ? { createdGuid: result.createdGuid } : {}),
    }
  })
}
