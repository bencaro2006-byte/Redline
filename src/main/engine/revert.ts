// revertBackup(): put back every "before" snapshot of one backup entry, in reverse order.
// Actions are re-resolved from the bundled catalog (trust.ts); the journal only supplies
// which settings to restore and their saved values.
import type { ApplyItemResult, ApplyReport } from '@shared/types'
import { getTweak } from '../catalog'
import { IpcError } from '../ipc/errors'
import { defaultDeps } from './apply'
import { itemResultsForTweaks, rebootNeeded } from './report'
import { trustedRestoreItems } from './trust'
import type { ApplyOptions, EngineDeps } from './types'

export async function revertBackup(backupId: string, options: ApplyOptions, deps: EngineDeps = defaultDeps(options.dryRun)): Promise<ApplyReport> {
  const entry = await deps.store.get(backupId)
  if (entry === undefined) throw new IpcError('NOT_FOUND', 'That backup no longer exists.')

  options.onProgress?.({ task: 'revert', message: options.dryRun ? 'Simulating revert' : 'Reverting', done: 0, total: 1 })
  const { items, rejected } = trustedRestoreItems(entry)
  let rows: ApplyItemResult[]
  try {
    const results = [...(await deps.invoke(items, options.dryRun)), ...rejected.map((r) => ({ key: r.key, ok: false, changed: false, error: r.error }))]
    rows = itemResultsForTweaks(results, (id) => getTweak(id)?.requiresReboot ?? false, options.dryRun)
    if (!options.dryRun && rows.every((r) => r.ok)) await deps.store.markReverted(entry.id)
  } finally {
    if (!options.dryRun) deps.afterChange()
  }
  options.onProgress?.({ task: 'revert', message: 'Done', done: 1, total: 1 })
  return { backupId: entry.id, restorePoint: null, results: rows, rebootRequired: rebootNeeded(rows) }
}
