// Dashboard: optimization score, live sensors, recommended next steps, health checks.
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, RefreshCw, Zap } from 'lucide-react'
import type { HealthCheck, LiveMetrics } from '@shared/types'
import { useApplyFlow } from '../features/apply/ApplyFlowProvider'
import { useAppData } from '../features/data/AppDataProvider'
import { computeScore } from '../features/score'
import { useApi } from '../lib/api'
import { formatGHz, formatPercent, formatUsage } from '../lib/format'
import { summarizePc, shortOsName } from '../lib/pcSummary'
import { ChipIcon, GamepadIcon, HistoryIcon, TrashIcon } from '../shell/icons'
import { useNavigation } from '../shell/navigation'
import type { RouteId } from '../shell/routes'
import { Button, Card, CardRow, Gauge, ImpactChip, Meter, Page, PageHeader, Skeleton, StatusChip } from '../ui'
import './dashboard.css'

const BOOST_CLOCK_MHZ = 4200

function LiveCard({ vramBytes }: { vramBytes: number | null }) {
  const api = useApi()
  const [m, setM] = useState<LiveMetrics | null>(null)
  useEffect(() => api.onLiveMetrics(setM), [api])

  if (m === null) {
    return (
      <Card eyebrow="Live" className="rl-dash__live" actions={<span className="rl-mono rl-muted">reading sensors</span>}>
        <div className="rl-dash__live-skeleton" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} height={34} />
          ))}
        </div>
      </Card>
    )
  }
  return (
    <Card eyebrow="Live" className="rl-dash__live" actions={<span className="rl-mono rl-muted">1 s</span>}>
      <Meter label="CPU load" percent={m.cpuLoad} valueText={formatPercent(m.cpuLoad)} />
      <Meter label="CPU clock" percent={m.cpuClockMHz !== null ? (m.cpuClockMHz / BOOST_CLOCK_MHZ) * 100 : null} valueText={formatGHz(m.cpuClockMHz)} />
      <Meter label="Memory" percent={(m.memUsedBytes / m.memTotalBytes) * 100} valueText={formatUsage(m.memUsedBytes, m.memTotalBytes)} />
      <Meter label="GPU 3D load" percent={m.gpuLoad} valueText={formatPercent(m.gpuLoad)} />
      <Meter
        label="GPU memory"
        percent={m.gpuMemUsedBytes !== null && vramBytes ? (m.gpuMemUsedBytes / vramBytes) * 100 : null}
        valueText={m.gpuMemUsedBytes !== null && vramBytes ? formatUsage(m.gpuMemUsedBytes, vramBytes) : 'n/a'}
      />
    </Card>
  )
}

function ScoreCard() {
  const { catalog, states, stateById } = useAppData()
  const flow = useApplyFlow()
  const { navigate } = useNavigation()
  const score = useMemo(() => computeScore(catalog.data?.tweaks ?? [], stateById, states.data !== null), [catalog.data, stateById, states.data])
  const loading = score.percent === null
  const pendingIds = score.pending.map((t) => t.id)

  return (
    <Card padding="lg" className="rl-dash__score">
      <div className="rl-dash__score-body">
        <Gauge value={score.percent ?? 0} pending={loading} />
        <div className="rl-dash__score-text">
          <span className="rl-eyebrow">Optimization score</span>
          {loading ? (
            <p className="rl-dash__score-line">Checking which optimizations are already in place…</p>
          ) : score.pending.length === 0 ? (
            <p className="rl-dash__score-line">All {score.total} recommended optimizations are active.</p>
          ) : (
            <p className="rl-dash__score-line">
              {score.applied} of {score.total} recommended optimizations are active. {score.pending.length} more {score.pending.length === 1 ? 'is' : 'are'} ready for this PC.
            </p>
          )}
          <div className="rl-dash__score-actions">
            <Button variant="primary" size="lg" icon={<Zap size={16} strokeWidth={2.4} />} disabled={loading || pendingIds.length === 0 || flow.busy} onClick={() => flow.request({ apply: pendingIds, revert: [] })}>
              Apply {pendingIds.length} recommended
            </Button>
            <Button variant="ghost" size="lg" onClick={() => navigate('optimizations')}>
              Review list
            </Button>
          </div>
          <span className="rl-dash__score-note">The score is the share of Redline's recommendations in place on this PC. It is not an FPS measurement.</span>
        </div>
      </div>
    </Card>
  )
}

function RecommendedCard() {
  const { catalog, states, stateById } = useAppData()
  const flow = useApplyFlow()
  const { navigate } = useNavigation()
  const next = useMemo(() => computeScore(catalog.data?.tweaks ?? [], stateById, states.data !== null).pending.slice(0, 4), [catalog.data, stateById, states.data])
  const loading = catalog.status === 'loading' || states.data === null

  return (
    <Card
      title="Recommended next"
      className="rl-dash__next"
      actions={
        <button type="button" className="rl-link" onClick={() => navigate('optimizations')}>
          See all
        </button>
      }
    >
      {loading &&
        Array.from({ length: 4 }, (_, i) => (
          <CardRow key={i}>
            <Skeleton height={38} />
          </CardRow>
        ))}
      {!loading && next.length === 0 && (
        <CardRow>
          <span className="rl-muted">Everything Redline recommends for this PC is already in place.</span>
        </CardRow>
      )}
      {!loading &&
        next.map((tweak) => (
          <CardRow key={tweak.id}>
            <div className="rl-dash__row-text">
              <span className="rl-dash__row-title">{tweak.title}</span>
              <span className="rl-dash__row-desc">{tweak.description}</span>
            </div>
            <ImpactChip impact={tweak.impact} />
            <Button size="sm" disabled={flow.busy} onClick={() => flow.request({ apply: [tweak.id], revert: [] })}>
              Apply
            </Button>
          </CardRow>
        ))}
    </Card>
  )
}

function HealthCard() {
  const { scan, stateById } = useAppData()
  const flow = useApplyFlow()
  const { navigate } = useNavigation()
  const checks: HealthCheck[] = (scan.data?.health ?? []).slice(0, 5)
  const canFix = (check: HealthCheck): boolean => check.tweakId !== undefined && stateById.get(check.tweakId)?.state !== 'applied'

  return (
    <Card
      title="Health checks"
      className="rl-dash__health"
      actions={
        <button type="button" className="rl-link" onClick={() => navigate('scan')}>
          Full report
        </button>
      }
    >
      {scan.data === null &&
        Array.from({ length: 4 }, (_, i) => (
          <CardRow key={i}>
            <Skeleton height={36} />
          </CardRow>
        ))}
      {checks.map((check) => (
        <CardRow key={check.id} className="rl-dash__check">
          <StatusChip status={check.status} />
          <div className="rl-dash__row-text">
            <span className="rl-dash__check-title">{check.title}</span>
            <span className="rl-dash__row-desc rl-dash__row-desc--wrap">{check.detail}</span>
          </div>
          {canFix(check) && check.tweakId !== undefined && (
            <Button size="sm" disabled={flow.busy} onClick={() => flow.request({ apply: [check.tweakId as string], revert: [] })}>
              Fix
            </Button>
          )}
        </CardRow>
      ))}
    </Card>
  )
}

const SHORTCUTS: readonly { route: RouteId; title: string; note: string; Icon: typeof HistoryIcon }[] = [
  { route: 'backups', title: 'Backups', note: 'Undo any change', Icon: HistoryIcon },
  { route: 'games', title: 'Games', note: 'Per-game settings', Icon: GamepadIcon },
  { route: 'debloat', title: 'Debloat', note: 'Remove preinstalled apps', Icon: TrashIcon },
  { route: 'scan', title: 'System Scan', note: 'Full hardware report', Icon: ChipIcon },
]

export function DashboardScreen() {
  const { scan, rescan, rescanning } = useAppData()
  const { navigate } = useNavigation()
  const info = scan.data?.info
  const eyebrow = info ? `Tuned for ${summarizePc(info).headline} · ${shortOsName(info.os)}` : 'Tuned for this PC'
  const vram = info?.gpus.find((g) => g.nvidiaDriver !== null)?.vramBytes ?? info?.gpus[0]?.vramBytes ?? null

  return (
    <Page label="Dashboard">
      <PageHeader
        title="Dashboard"
        eyebrow={eyebrow}
        actions={
          <Button variant="subtle" icon={<RefreshCw size={16} />} loading={rescanning} onClick={() => rescan(true)}>
            Rescan system
          </Button>
        }
      />
      <div className="rl-row">
        <ScoreCard />
        <LiveCard vramBytes={vram} />
      </div>
      <div className="rl-row">
        <RecommendedCard />
        <HealthCard />
      </div>
      <nav className="rl-dash__tiles" aria-label="Shortcuts">
        {SHORTCUTS.map(({ route, title, note, Icon }) => (
          <button key={route} type="button" className="rl-dash__tile" onClick={() => navigate(route)}>
            <Icon size={24} strokeWidth={1.8} className="rl-dash__tile-icon" />
            <span className="rl-dash__tile-text">
              <span className="rl-dash__tile-title">{title}</span>
              <span className="rl-dash__tile-note">{note}</span>
            </span>
            <ArrowRight size={16} className="rl-dash__tile-arrow" aria-hidden="true" />
          </button>
        ))}
      </nav>
    </Page>
  )
}
