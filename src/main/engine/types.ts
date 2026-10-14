// Engine-internal types shared by probe/invoke/plan/apply/revert.
import type { TweakAction } from '@shared/catalog'
import type { RestorePointResult, Snapshot } from '@shared/types'
import type { ProgressReporter } from '../progress'
import type { BackupStore } from './backups'
import type { ProbeOutcome } from './probe'

export interface ProbeItem {
  key: string
  action: TweakAction
}

export type InvokeOp = 'set' | 'restore'

export interface InvokeItem {
  key: string
  op: InvokeOp
  action: TweakAction
  /** Required for op 'restore': the snapshot to put back. */
  restore?: Snapshot
}

export interface InvokeResult {
  key: string
  ok: boolean
  changed: boolean
  error?: string
  /** powerScheme 'set' only: GUID of the duplicated Ultimate Performance scheme. */
  createdGuid?: string | null
}

export interface ApplyOptions {
  /** true = touch nothing; scripts report what would change. */
  dryRun: boolean
  /** Create a System Restore point first (settings.restorePointBeforeApply). */
  restorePoint: boolean
  onProgress?: ProgressReporter
}

export interface RestorePointOptions {
  dryRun: boolean
}

/** IO the apply/revert flows depend on; injectable so the flows are unit-testable. */
export interface EngineDeps {
  probe(items: readonly ProbeItem[]): Promise<ProbeOutcome>
  invoke(items: readonly InvokeItem[], dryRun: boolean): Promise<InvokeResult[]>
  store: Pick<BackupStore, 'list' | 'get' | 'append' | 'updateEntry' | 'remove' | 'markReverted'>
  createRestorePoint(): Promise<RestorePointResult>
  afterChange(): void
}
