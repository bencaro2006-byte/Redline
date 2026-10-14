// Presentational dialog for the apply / revert flow (ApplyFlowProvider owns the state).
import type { Tweak } from '@shared/catalog'
import type { AppStatus, ApplyItemResult, ApplyReport, RestorePointResult } from '@shared/types'
import { CheckCircle2, CircleAlert, CircleMinus, RotateCcw } from 'lucide-react'
import { Button, Chip, Modal, RiskChip } from '../../ui'
import { formatWhen } from '../../lib/format'
import { describeApply } from '../describe'
import type { ApplyRequest, FlowStage } from './ApplyFlowProvider'
import './apply.css'

interface ApplyDialogProps {
  stage: FlowStage
  status: AppStatus | null
  lookup: (ids: readonly string[]) => Tweak[]
  onConfirm: () => void
  onClose: () => void
}

function titleFor(req: ApplyRequest, prefix: { apply: string; revert: string }): string {
  const a = req.apply.length
  const r = req.revert.length
  const plural = (n: number): string => `${n} optimization${n === 1 ? '' : 's'}`
  if (a > 0 && r > 0) return `${prefix.apply} ${a}, ${prefix.revert.toLowerCase()} ${r}`
  return a > 0 ? `${prefix.apply} ${plural(a)}` : `${prefix.revert} ${plural(r)}`
}

function ChangeList({ tweaks, mode }: { tweaks: readonly Tweak[]; mode: 'apply' | 'revert' }) {
  return (
    <ul className="rl-apply__list">
      {tweaks.map((tweak) => (
        <li key={tweak.id} className="rl-apply__item">
          <div className="rl-apply__item-head">
            <span className="rl-apply__item-title">{tweak.title}</span>
            <span className="rl-apply__chips">
              {tweak.risk !== 'safe' && <RiskChip risk={tweak.risk} />}
              {tweak.requiresReboot && <Chip variant="reboot">REBOOT</Chip>}
            </span>
          </div>
          {mode === 'apply' ? (
            <ul className="rl-apply__actions rl-selectable">
              {tweak.actions.map((action, i) => (
                <li key={i}>{describeApply(action)}</li>
              ))}
            </ul>
          ) : (
            <p className="rl-apply__revert-note">Back to the value saved before Redline changed it, or the Windows default if it never did.</p>
          )}
        </li>
      ))}
    </ul>
  )
}

function ConfirmBody({ stage, status, lookup }: { stage: Extract<FlowStage, { kind: 'confirm' }>; status: AppStatus | null; lookup: ApplyDialogProps['lookup'] }) {
  const apply = lookup(stage.request.apply)
  const revert = lookup(stage.request.revert)
  const reboot = [...apply, ...revert].some((t) => t.requiresReboot)
  const dryRun = status?.dryRun === true
  return (
    <div className="rl-apply">
      {dryRun && (
        <p className="rl-apply__banner rl-apply__banner--info">Dry run is on. Redline reads your settings and reports what would change, but writes nothing.</p>
      )}
      {!dryRun && status?.elevated === false && (
        <p className="rl-apply__banner rl-apply__banner--warn">Redline is not running as administrator, so these changes can't be applied. Restart it as administrator, or turn on dry run in Settings.</p>
      )}
      {apply.length > 0 && (
        <section aria-label="Changes to apply">
          <h3 className="rl-apply__heading">Will change</h3>
          <ChangeList tweaks={apply} mode="apply" />
        </section>
      )}
      {revert.length > 0 && (
        <section aria-label="Changes to revert">
          <h3 className="rl-apply__heading">Will revert</h3>
          <ChangeList tweaks={revert} mode="revert" />
        </section>
      )}
      <ul className="rl-apply__notes">
        {!dryRun && apply.length > 0 && stage.restorePoint && <li>A System Restore point is created first.</li>}
        {!dryRun && <li>Every value is backed up before it changes, so you can undo it from Backups.</li>}
        {reboot && <li>Some changes take full effect after a restart.</li>}
      </ul>
    </div>
  )
}

function ResultIcon({ row }: { row: ApplyItemResult }) {
  if (!row.ok) return <CircleAlert size={16} className="rl-apply__icon rl-apply__icon--fail" aria-label="Failed" />
  if (!row.changed) return <CircleMinus size={16} className="rl-apply__icon rl-apply__icon--same" aria-label="Already set" />
  return <CheckCircle2 size={16} className="rl-apply__icon rl-apply__icon--ok" aria-label={row.dryRun ? 'Would change' : 'Changed'} />
}

function restorePointText(rp: RestorePointResult): string {
  if (rp.created) return 'Restore point created.'
  if (rp.skippedRecent && rp.latestCreatedAt) return `Windows kept the restore point from ${formatWhen(rp.latestCreatedAt)} (it allows one per 24 hours).`
  return rp.warning || 'No restore point was created.'
}

function DoneBody({ stage, lookup }: { stage: Extract<FlowStage, { kind: 'done' }>; lookup: ApplyDialogProps['lookup'] }) {
  const rows = stage.reports.flatMap((r) => r.results)
  const titles = new Map(lookup(rows.map((r) => r.tweakId)).map((t) => [t.id, t.title]))
  const dryRun = rows.some((r) => r.dryRun)
  const changed = rows.filter((r) => r.ok && r.changed).length
  const same = rows.filter((r) => r.ok && !r.changed).length
  const failed = rows.filter((r) => !r.ok).length
  const reboot = stage.reports.some((r) => r.rebootRequired)
  const restore = stage.reports.find((r) => r.restorePoint !== null)?.restorePoint ?? null
  return (
    <div className="rl-apply">
      {stage.error !== null && <p className="rl-apply__banner rl-apply__banner--warn">{stage.error}</p>}
      <p className="rl-apply__summary">
        <span className="rl-mono">{changed}</span> {dryRun ? 'would change' : 'changed'} · <span className="rl-mono">{same}</span> already set ·{' '}
        <span className="rl-mono">{failed}</span> failed
      </p>
      <ul className="rl-apply__results">
        {rows.map((row) => (
          <li key={row.tweakId} className="rl-apply__result">
            <ResultIcon row={row} />
            <span className="rl-apply__result-text">
              <span>{titles.get(row.tweakId) ?? row.tweakId}</span>
              {row.error !== undefined && <span className="rl-apply__error rl-selectable">{row.error}</span>}
            </span>
          </li>
        ))}
      </ul>
      <ul className="rl-apply__notes">
        {restore !== null && <li>{restorePointText(restore)}</li>}
        {reboot && !dryRun && (
          <li className="rl-apply__reboot">
            <RotateCcw size={14} aria-hidden="true" /> Restart Windows to finish applying these changes.
          </li>
        )}
      </ul>
    </div>
  )
}

export function ApplyDialog({ stage, status, lookup, onConfirm, onClose }: ApplyDialogProps) {
  if (stage.kind === 'idle') return null
  const dryRun = status?.dryRun === true
  const blocked = !dryRun && status?.elevated === false

  if (stage.kind === 'confirm') {
    return (
      <Modal
        key="confirm"
        open
        size="lg"
        title={titleFor(stage.request, dryRun ? { apply: 'Simulate', revert: 'Simulate reverting' } : { apply: 'Apply', revert: 'Revert' })}
        onClose={onClose}
        actions={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onConfirm} disabled={blocked}>
              {dryRun ? 'Run dry run' : 'Apply changes'}
            </Button>
          </>
        }
      >
        <ConfirmBody stage={stage} status={status} lookup={lookup} />
      </Modal>
    )
  }

  if (stage.kind === 'running') {
    const p = stage.progress
    const percent = p !== null && p.total > 0 ? Math.round((p.done / p.total) * 100) : null
    return (
      <Modal key="running" open size="md" dismissible={false} title={titleFor(stage.request, { apply: 'Applying', revert: 'Reverting' })} onClose={onClose}>
        <div className="rl-apply__progress" role="status" aria-live="polite">
          <div className="rl-apply__bar" aria-hidden="true">
            <div className={`rl-apply__bar-fill${percent === null ? ' rl-apply__bar-fill--indeterminate' : ''}`} style={percent !== null ? { transform: `scaleX(${percent / 100})` } : undefined} />
          </div>
          <span className="rl-apply__progress-text">{p?.message ?? 'Starting'}</span>
        </div>
      </Modal>
    )
  }

  return (
    <Modal key="done" open size="lg" title={dryRun ? 'Dry run finished' : 'Finished'} onClose={onClose} actions={<Button variant="primary" onClick={onClose}>Close</Button>}>
      <DoneBody stage={stage} lookup={lookup} />
    </Modal>
  )
}
