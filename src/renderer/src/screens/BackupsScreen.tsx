// Backups: every change Redline made, with the value it replaced, and one-click revert.
import { useCallback, useState } from 'react'
import { ChevronDown, LifeBuoy, RotateCcw } from 'lucide-react'
import type { BackupEntry } from '@shared/types'
import { useAppData } from '../features/data/AppDataProvider'
import { describeApply, describeSnapshot } from '../features/describe'
import { useApi } from '../lib/api'
import { formatWhen } from '../lib/format'
import { useResult } from '../lib/useResult'
import { HistoryIcon } from '../shell/icons'
import { useAppStatus } from '../shell/appStatus'
import { Button, Card, Chip, EmptyState, Modal, Page, PageHeader, Skeleton, useToast } from '../ui'
import './backups.css'

function EntryRow({ entry, busy, onRevert }: { entry: BackupEntry; busy: boolean; onRevert: (entry: BackupEntry) => void }) {
  const [open, setOpen] = useState(false)
  const detailsId = `backup-${entry.id}`
  return (
    <li className="rl-backup">
      <div className="rl-backup__head">
        <button type="button" className="rl-backup__toggle" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((v) => !v)}>
          <ChevronDown size={16} className={`rl-backup__chev${open ? ' rl-backup__chev--open' : ''}`} aria-hidden="true" />
          <span className="rl-backup__label">{entry.label}</span>
        </button>
        <Chip variant="category">{entry.kind === 'game' ? 'GAME' : 'TWEAKS'}</Chip>
        <span className="rl-backup__when rl-mono">{formatWhen(entry.createdAt)}</span>
        {entry.revertedAt !== null ? (
          <Chip variant="ok">REVERTED {formatWhen(entry.revertedAt).toUpperCase()}</Chip>
        ) : (
          <Button size="sm" icon={<RotateCcw size={14} />} disabled={busy} onClick={() => onRevert(entry)}>
            Revert
          </Button>
        )}
      </div>
      {open && (
        <ul id={detailsId} className="rl-backup__items rl-selectable">
          {entry.items.map((item) => (
            <li key={item.key}>
              <span>{describeApply(item.action)}</span>
              <span className="rl-backup__was">was {describeSnapshot(item.before)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export function BackupsScreen() {
  const api = useApi()
  const toast = useToast()
  const { status } = useAppStatus()
  const { reloadStates, rescan } = useAppData()
  const loadBackups = useCallback(() => api.listBackups(), [api])
  const { state, reload } = useResult(loadBackups)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<{ entries: BackupEntry[]; all: boolean } | null>(null)

  const entries = state.data ?? []
  const open = entries.filter((e) => e.revertedAt === null)

  const afterChange = (): void => {
    reload()
    reloadStates()
    rescan(false)
  }

  const runReverts = async (targets: readonly BackupEntry[]): Promise<void> => {
    setBusy(true)
    let failed = 0
    let dryRun = false
    for (const entry of targets) {
      const result = await api.revertBackup({ backupId: entry.id })
      if (!result.ok || result.data.results.some((r) => !r.ok)) failed += 1
      if (result.ok) dryRun = result.data.results.some((r) => r.dryRun)
    }
    setBusy(false)
    afterChange()
    if (dryRun) toast.show({ title: 'Dry run: nothing was reverted', message: 'Turn off dry run in Settings to revert for real.', tone: 'info' })
    else if (failed > 0) toast.show({ title: `${failed} backup${failed === 1 ? '' : 's'} could not be fully reverted`, message: 'Open the entry to see what it changed, then try again as administrator.', tone: 'error' })
    else toast.show({ title: targets.length === 1 ? 'Reverted' : `Reverted ${targets.length} backups`, tone: 'ok' })
  }

  const createRestorePoint = (): void => {
    setBusy(true)
    api
      .createRestorePoint()
      .then((result) => {
        if (!result.ok) toast.show({ title: 'No restore point', message: result.error.message, tone: 'error' })
        else if (result.data.created) toast.show({ title: 'Restore point created', tone: 'ok' })
        else toast.show({ title: 'No new restore point', message: result.data.warning || 'Windows allows one restore point per 24 hours.', tone: 'info' })
      })
      .finally(() => setBusy(false))
  }

  return (
    <Page label="Backups">
      <PageHeader
        title="Backups"
        eyebrow="Undo anything Redline changed"
        actions={
          <>
            <Button variant="ghost" icon={<LifeBuoy size={16} />} disabled={busy} onClick={createRestorePoint}>
              Create restore point
            </Button>
            <Button variant="primary" icon={<RotateCcw size={16} />} disabled={busy || open.length === 0} onClick={() => setConfirm({ entries: open, all: true })}>
              Revert all Redline changes
            </Button>
          </>
        }
      />
      <Card title="How undo works" eyebrow={status?.dryRun ? 'Dry run is on' : undefined}>
        <p className="rl-muted rl-backups__intro">
          Before Redline changes anything it records the current value. Reverting puts exactly that value back, newest change first. A Windows restore point is a second safety net for the whole system.
        </p>
      </Card>
      {state.status === 'error' && <EmptyState tone="error" title="Could not read backups" message={state.error?.message} />}
      {state.data === null && state.status === 'loading' && (
        <Card>
          <Skeleton height={44} />
          <Skeleton height={44} />
        </Card>
      )}
      {state.data !== null && entries.length === 0 && (
        <EmptyState icon={<HistoryIcon size={26} />} title="Nothing to undo yet" message="Changes you apply in Optimizations or Games appear here with the values they replaced." />
      )}
      {entries.length > 0 && (
        <Card title={`History · ${entries.length}`}>
          <ul className="rl-backups__list">
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} busy={busy} onRevert={(e) => setConfirm({ entries: [e], all: false })} />
            ))}
          </ul>
        </Card>
      )}
      <Modal
        open={confirm !== null}
        title={confirm?.all ? `Revert all ${confirm.entries.length} backups?` : 'Revert this change?'}
        description={confirm?.all ? 'Every Redline change is put back to the value it replaced, newest first.' : confirm?.entries[0]?.label}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const targets = confirm?.entries ?? []
                setConfirm(null)
                void runReverts(targets)
              }}
            >
              Revert
            </Button>
          </>
        }
      />
    </Page>
  )
}
