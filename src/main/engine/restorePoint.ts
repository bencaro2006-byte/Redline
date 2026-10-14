// createRestorePoint(): New-RestorePoint.ps1 (spec §8). Detects the 24-hour skip.
// In dry-run mode it creates nothing.
import type { RestorePointResult } from '@shared/types'
import { runScript } from '../ps/runner'
import { RestorePointDataSchema } from './schemas'
import type { RestorePointOptions } from './types'

export const RESTORE_POINT_DESCRIPTION = 'Redline Optimizer'

export async function createRestorePoint(description: string, options: RestorePointOptions): Promise<RestorePointResult> {
  if (options.dryRun) {
    return { created: false, skippedRecent: false, latestCreatedAt: null, warning: 'Dry run: no restore point was created.' }
  }
  return runScript('restorePoint', { description }, RestorePointDataSchema)
}
