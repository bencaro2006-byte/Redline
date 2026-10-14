// Debloat: remove preinstalled Store apps (reinstallable from the Store), see what is
// protected, and see which popular "optimizer" tweaks Redline deliberately leaves out.
import { useCallback, useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { AppxState } from '@shared/types'
import { useAppData } from '../features/data/AppDataProvider'
import { useApi } from '../lib/api'
import { useResult } from '../lib/useResult'
import { useAppStatus } from '../shell/appStatus'
import { useNavigation } from '../shell/navigation'
import { Button, Card, EmptyState, Modal, Page, PageHeader, Skeleton, useToast } from '../ui'
import './debloat.css'

function AppRow({ app, checked, onChange }: { app: AppxState; checked: boolean; onChange: (pkg: string, next: boolean) => void }) {
  const id = `appx-${app.package}`
  return (
    <li className={`rl-appx${app.installed ? '' : ' rl-appx--absent'}`}>
      <input id={id} type="checkbox" checked={checked} disabled={!app.installed} onChange={(e) => onChange(app.package, e.target.checked)} />
      <label htmlFor={id} className="rl-appx__text">
        <span className="rl-appx__title">
          {app.title}
          {!app.installed && <span className="rl-appx__absent">Not installed</span>}
        </span>
        <span className="rl-appx__pkg rl-mono">{app.package}</span>
        {app.note !== '' && <span className="rl-appx__note">{app.note}</span>}
      </label>
    </li>
  )
}

function AppList({ apps, selected, onChange }: { apps: readonly AppxState[]; selected: ReadonlySet<string>; onChange: (pkg: string, next: boolean) => void }) {
  return (
    <ul className="rl-appx__list">
      {apps.map((app) => (
        <AppRow key={app.package} app={app} checked={selected.has(app.package)} onChange={onChange} />
      ))}
    </ul>
  )
}

export function DebloatScreen() {
  const api = useApi()
  const toast = useToast()
  const { status } = useAppStatus()
  const { navigate } = useNavigation()
  const { catalog } = useAppData()
  const loadApps = useCallback(() => api.listAppx(), [api])
  const { state, reload } = useResult(loadApps)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)

  const apps = useMemo(() => state.data ?? [], [state.data])
  const recommended = apps.filter((a) => a.recommended)
  const optional = apps.filter((a) => !a.recommended)
  const chosen = apps.filter((a) => selected.has(a.package) && a.installed)

  const onChange = (pkg: string, next: boolean): void =>
    setSelected((prev) => {
      const copy = new Set(prev)
      if (next) copy.add(pkg)
      else copy.delete(pkg)
      return copy
    })

  const selectRecommended = (): void => setSelected(new Set(recommended.filter((a) => a.installed).map((a) => a.package)))

  const remove = (): void => {
    setConfirming(false)
    setRemoving(true)
    api
      .removeAppx({ packages: chosen.map((a) => a.package) })
      .then((result) => {
        if (!result.ok) {
          toast.show({ title: 'Could not remove apps', message: result.error.message, tone: 'error' })
          return
        }
        const { removed, failed, dryRun } = result.data
        if (dryRun) toast.show({ title: `Dry run: ${removed.length} app${removed.length === 1 ? '' : 's'} would be removed`, message: 'Nothing was changed.', tone: 'info' })
        else toast.show({ title: `Removed ${removed.length} app${removed.length === 1 ? '' : 's'}`, message: failed.length > 0 ? `${failed.length} failed: ${failed.map((f) => f.package).join(', ')}` : 'Reinstall any of them from the Microsoft Store.', tone: failed.length > 0 ? 'fix' : 'ok' })
        if (!dryRun) setSelected(new Set())
        reload()
      })
      .finally(() => setRemoving(false))
  }

  return (
    <Page label="Debloat">
      <PageHeader title="Debloat" eyebrow="Preinstalled apps · Windows 10 22H2" />
      <div className="rl-debloat">
        <div className="rl-debloat__main">
          {state.status === 'error' && <EmptyState tone="error" title="Could not list installed apps" message={state.error?.message} />}
          {state.data === null && state.status === 'loading' && (
            <Card>
              <Skeleton height={22} width="40%" />
              <Skeleton height={160} />
            </Card>
          )}
          {state.data !== null && (
            <>
              <Card
                title="Safe to remove"
                actions={
                  <Button size="sm" variant="ghost" onClick={selectRecommended}>
                    Select all
                  </Button>
                }
              >
                <AppList apps={recommended} selected={selected} onChange={onChange} />
              </Card>
              <Card title="Keep if you use them" eyebrow="Not selected by default">
                <AppList apps={optional} selected={selected} onChange={onChange} />
              </Card>
            </>
          )}
          <Card title="Privacy and background services">
            <p className="rl-muted rl-debloat__p">Telemetry, tips, Cortana, background services and scheduled tasks are switched off from Optimizations, where every change shows exactly what it touches.</p>
            <div>
              <Button size="sm" onClick={() => navigate('optimizations')}>
                Open Optimizations
              </Button>
            </div>
          </Card>
        </div>

        <aside className="rl-debloat__aside">
          <Card variant="raised" eyebrow="Selected">
            <span className="rl-debloat__count">
              {chosen.length}
              <span className="rl-debloat__count-unit"> apps</span>
            </span>
            <p className="rl-muted rl-debloat__p">Removed for every user on this PC. Any of them can be reinstalled from the Microsoft Store.</p>
            <Button variant="primary" size="lg" fullWidth disabled={chosen.length === 0} loading={removing} onClick={() => setConfirming(true)}>
              {status?.dryRun ? `Simulate removing ${chosen.length}` : `Remove ${chosen.length} apps`}
            </Button>
          </Card>
          <Card title="Never touched">
            <ul className="rl-debloat__plain">
              {(catalog.data?.neverRemove ?? []).slice(0, 12).map((n) => (
                <li key={n.package} title={n.reason}>
                  <ShieldCheck size={14} aria-hidden="true" />
                  {n.title}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Not offered, and why">
            <ul className="rl-debloat__excluded">
              {(catalog.data?.excluded ?? []).map((e) => (
                <li key={e.name}>
                  <span className="rl-debloat__ex-name">{e.name}</span>
                  <span className="rl-muted">{e.reason}</span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>

      <Modal
        open={confirming}
        title={status?.dryRun ? 'Simulate removing these apps?' : `Remove ${chosen.length} apps?`}
        description="They are removed for every user and deprovisioned so new accounts don't get them. You can reinstall any of them from the Microsoft Store."
        onClose={() => setConfirming(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={remove}>
              {status?.dryRun ? 'Run dry run' : 'Remove apps'}
            </Button>
          </>
        }
      >
        <ul className="rl-debloat__confirm">
          {chosen.map((a) => (
            <li key={a.package}>
              {a.title} <span className="rl-mono rl-muted">{a.package}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </Page>
  )
}
