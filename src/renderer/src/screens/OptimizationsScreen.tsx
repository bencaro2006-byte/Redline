// Optimizations: the full catalog with filters, toggles that stage changes, a pending bar
// and the detail drawer. Applying goes through the shared ApplyFlow (confirm -> run -> results).
import { useCallback, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { Category, Risk } from '@shared/catalog'
import { useApplyFlow } from '../features/apply/ApplyFlowProvider'
import { useAppData } from '../features/data/AppDataProvider'
import { EMPTY_FILTER, categoryCounts, filterTweaks, isOn, pendingChanges, type TweakFilter } from '../features/filters'
import { CATEGORY_LABEL } from '../features/labels'
import { NvidiaChecklist } from '../features/NvidiaChecklist'
import { Button, EmptyState, Page, PageHeader, Skeleton } from '../ui'
import { TweakCard } from './optimizations/TweakCard'
import { TweakDetails } from './optimizations/TweakDetails'
import './optimizations/optimizations.css'

const RISKS: readonly (Risk | 'all')[] = ['all', 'safe', 'moderate', 'advanced']
const RISK_LABEL: Readonly<Record<Risk | 'all', string>> = { all: 'All risks', safe: 'Safe', moderate: 'Moderate', advanced: 'Advanced' }

function categoryLabel(id: Category | 'all'): string {
  return id === 'all' ? 'All' : CATEGORY_LABEL[id]
}

export function OptimizationsScreen() {
  const { catalog, states, stateById, reloadStates } = useAppData()
  const flow = useApplyFlow()
  const [filter, setFilter] = useState<TweakFilter>(EMPTY_FILTER)
  const [desired, setDesired] = useState<Readonly<Record<string, boolean>>>({})
  const [detailsId, setDetailsId] = useState<string | null>(null)

  const tweaks = useMemo(() => catalog.data?.tweaks ?? [], [catalog.data])
  const visible = useMemo(() => filterTweaks(tweaks, filter), [tweaks, filter])
  const counts = useMemo(() => categoryCounts(tweaks, filter), [tweaks, filter])
  const pending = useMemo(() => pendingChanges(desired, stateById), [desired, stateById])
  const pendingCount = pending.apply.length + pending.revert.length
  const pendingIds = useMemo(() => new Set([...pending.apply, ...pending.revert]), [pending])
  const statesReady = states.data !== null

  const onToggle = useCallback((id: string, next: boolean) => setDesired((prev) => ({ ...prev, [id]: next })), [])
  const onDetails = useCallback((id: string) => setDetailsId(id), [])
  const update = (patch: Partial<TweakFilter>): void => setFilter((prev) => ({ ...prev, ...patch }))

  // Staged toggles stay until the run finishes, so Cancel in the confirm dialog keeps them.
  const applyPending = (): void => flow.request(pending, { onFinished: () => setDesired({}) })

  const details = detailsId !== null ? (tweaks.find((t) => t.id === detailsId) ?? null) : null

  return (
    <Page label="Optimizations">
      <PageHeader
        title="Optimizations"
        eyebrow={`${tweaks.length || '…'} tweaks · FPS · latency · registry · debloat`}
        actions={
          <>
            <label className="rl-opt__search">
              <Search size={16} aria-hidden="true" className="rl-muted" />
              <span className="rl-visually-hidden">Search optimizations</span>
              <input type="search" placeholder="Search optimizations" value={filter.query} onChange={(e) => update({ query: e.target.value })} />
            </label>
            <div role="group" aria-label="Risk filter" className="rl-segmented">
              {RISKS.map((risk) => (
                <button key={risk} type="button" aria-pressed={filter.risk === risk} className="rl-segmented__item" onClick={() => update({ risk })}>
                  {RISK_LABEL[risk]}
                </button>
              ))}
            </div>
          </>
        }
      />

      <div className="rl-opt__filters">
        <div role="group" aria-label="Categories" className="rl-opt__cats">
          {counts.map(({ id, count }) => (
            <button key={id} type="button" aria-pressed={filter.category === id} className="rl-cat" onClick={() => update({ category: id })}>
              {categoryLabel(id)}
              <span className="rl-cat__count rl-mono">{count}</span>
            </button>
          ))}
        </div>
        <label className="rl-opt__rec">
          <input type="checkbox" checked={filter.recommendedOnly} onChange={(e) => update({ recommendedOnly: e.target.checked })} />
          Recommended only
        </label>
      </div>

      {catalog.status === 'error' && (
        <EmptyState tone="error" title="Could not load optimizations" message={catalog.error?.message} />
      )}
      {states.status === 'error' && (
        <EmptyState
          tone="error"
          title="Could not read your current settings"
          message={states.error?.message}
          action={
            <Button size="sm" onClick={reloadStates}>
              Try again
            </Button>
          }
        />
      )}

      {filter.category === 'gpu' && catalog.data !== null && <NvidiaChecklist className="rl-opt__nvidia" />}

      <div className="rl-opt__grid" aria-busy={catalog.data === null || !statesReady}>
        {catalog.data === null &&
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rl-tweak">
              <Skeleton height={20} width="60%" />
              <Skeleton height={36} />
              <Skeleton height={22} width="45%" />
            </div>
          ))}
        {visible.map((tweak) => {
          const state = stateById.get(tweak.id)
          const isPending = pendingIds.has(tweak.id)
          const checked = desired[tweak.id] ?? isOn(state)
          return (
            <TweakCard
              key={tweak.id}
              tweak={tweak}
              state={state}
              checked={checked}
              pending={isPending}
              disabled={!statesReady || flow.busy}
              onToggle={onToggle}
              onDetails={onDetails}
            />
          )
        })}
      </div>

      {catalog.data !== null && visible.length === 0 && (
        <EmptyState
          title="No optimizations match"
          message="Try another category, risk level or search."
          action={
            <Button size="sm" onClick={() => setFilter(EMPTY_FILTER)}>
              Clear filters
            </Button>
          }
        />
      )}

      <div className={`rl-opt__bar${pendingCount > 0 ? ' rl-opt__bar--active' : ''}`} role="region" aria-label="Pending changes">
        <span className="rl-opt__bar-count rl-mono">{pendingCount}</span>
        <div className="rl-opt__bar-text">
          <span className="rl-opt__bar-title">{pendingCount === 1 ? 'change pending' : 'changes pending'}</span>
          <span className="rl-opt__bar-note">Redline backs up every value it touches and can make a restore point before applying.</span>
        </div>
        <Button variant="ghost" disabled={pendingCount === 0} onClick={() => setDesired({})}>
          Discard
        </Button>
        <Button variant="primary" disabled={pendingCount === 0 || flow.busy} onClick={applyPending}>
          Review &amp; apply
        </Button>
      </div>

      <TweakDetails tweak={details} state={details ? stateById.get(details.id) : undefined} onClose={() => setDetailsId(null)} />
    </Page>
  )
}
