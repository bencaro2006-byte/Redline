// System Scan: read-only hardware report and everything the scan found.
import type { ReactNode } from 'react'
import { ClipboardCopy, RefreshCw } from 'lucide-react'
import type { HealthCheck, SystemInfo } from '@shared/types'
import { ratedSpeedFromPartNumber } from '@shared/hardware'
import { useApplyFlow } from '../features/apply/ApplyFlowProvider'
import { useAppData } from '../features/data/AppDataProvider'
import { buildReport } from '../features/report'
import { formatDiskSize, formatWhen } from '../lib/format'
import { shortCpuName, shortOsName } from '../lib/pcSummary'
import { Button, Card, CardRow, EmptyState, Page, PageHeader, Skeleton, StatusChip, useToast } from '../ui'
import './scan.css'

const GIB = 1024 ** 3

function Spec({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rl-scan__spec">
      <dt>{label}</dt>
      <dd className="rl-mono">{value}</dd>
    </div>
  )
}

function SpecCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <Card eyebrow={eyebrow} className="rl-scan__card">
      <h2 className="rl-scan__card-title">{title}</h2>
      <dl className="rl-scan__specs">{children}</dl>
    </Card>
  )
}

function HardwareCards({ info }: { info: SystemInfo }) {
  const gpu = info.gpus.find((g) => g.nvidiaDriver !== null) ?? info.gpus[0]
  const modules = info.memory.modules
  const running = modules.length > 0 ? Math.min(...modules.map((m) => m.configuredMTs || m.speedMTs)) : null
  const rated = Math.max(0, ...modules.map((m) => ratedSpeedFromPartNumber(m.partNumber) ?? 0)) || null
  const sizes = [...new Set(modules.map((m) => Math.round(m.capacityBytes / GIB)))]
  return (
    <div className="rl-row">
      <SpecCard eyebrow="Processor" title={info.cpu.name.replace(/\((R|TM)\)/g, '').replace(/\s+CPU.*$/, '').trim()}>
        <Spec label="Cores / threads" value={`${info.cpu.cores} / ${info.cpu.threads}`} />
        <Spec label="Base clock" value={`${(info.cpu.baseMHz / 1000).toFixed(1)} GHz`} />
        <Spec label="Model" value={shortCpuName(info.cpu.name)} />
        <Spec label="Vendor" value={info.cpu.vendor.replace(/^Genuine/, '')} />
      </SpecCard>
      <SpecCard eyebrow="Graphics" title={gpu?.name ?? 'Unknown GPU'}>
        <Spec label="Video memory" value={gpu?.vramBytes ? `${Math.round(gpu.vramBytes / GIB)} GB` : 'n/a'} />
        <Spec label="Driver" value={gpu?.nvidiaDriver ?? gpu?.driverVersion ?? 'n/a'} />
        <Spec label="GPU scheduling" value={info.gaming.hagsOn === null ? 'n/a' : info.gaming.hagsOn ? 'On' : 'Off'} />
        <Spec label="Adapters" value={String(info.gpus.length)} />
      </SpecCard>
      <SpecCard eyebrow="Memory" title={`${Math.round(info.memory.totalBytes / GIB)} GB`}>
        <Spec label="Modules" value={sizes.length === 1 ? `${modules.length} × ${sizes[0]} GB` : String(modules.length)} />
        <Spec label="Running at" value={running ? `${running} MT/s` : 'n/a'} />
        <Spec label="Rated" value={rated ? `${rated} MT/s` : 'n/a'} />
        <Spec label="Maker" value={modules[0]?.manufacturer || 'n/a'} />
      </SpecCard>
    </div>
  )
}

function PlatformCard({ info }: { info: SystemInfo }) {
  const disk = info.disks.find((d) => d.isSystem) ?? info.disks[0]
  const display = info.displays[0]
  const rows: [string, string][] = [
    ['Storage', disk ? `${disk.model} · ${formatDiskSize(disk.sizeBytes)} ${disk.busType} ${disk.mediaType}` : 'n/a'],
    ['Motherboard', `${info.board.manufacturer.replace(/ Technology Co\., Ltd\./, '')} ${info.board.product}`],
    ['BIOS', `${info.bios.version}${info.bios.releaseDate ? ` · ${info.bios.releaseDate.slice(0, 10)}` : ''}`],
    ['Windows', `${shortOsName(info.os)} · build ${info.os.build}`],
    ['Display', display ? `${display.width} × ${display.height} @ ${display.refreshHz} Hz` : 'n/a'],
    ['Power plan', info.power.activeSchemeName || 'n/a'],
    ['Computer name', info.computerName],
  ]
  return (
    <Card title="Platform" className="rl-scan__platform">
      {rows.map(([label, value]) => (
        <CardRow key={label} className="rl-scan__platform-row">
          <span className="rl-muted">{label}</span>
          <span className="rl-mono rl-selectable rl-scan__platform-value">{value}</span>
        </CardRow>
      ))}
    </Card>
  )
}

function FindingsCard({ health }: { health: readonly HealthCheck[] }) {
  const { stateById } = useAppData()
  const flow = useApplyFlow()
  const count = (status: HealthCheck['status']): number => health.filter((h) => h.status === status).length
  return (
    <Card title="What the scan found" className="rl-scan__findings" actions={<span className="rl-mono rl-muted rl-scan__tally">{`${count('fix')} FIX · ${count('info')} INFO · ${count('ok')} OK`}</span>}>
      {health.map((check) => {
        const fixable = check.tweakId !== undefined && stateById.get(check.tweakId)?.state !== 'applied'
        return (
          <CardRow key={check.id} className="rl-scan__finding">
            <StatusChip status={check.status} />
            <div className="rl-scan__finding-text">
              <span className="rl-scan__finding-title">{check.title}</span>
              <span className="rl-muted">{check.detail}</span>
            </div>
            {fixable && check.tweakId !== undefined && (
              <Button size="sm" disabled={flow.busy} onClick={() => flow.request({ apply: [check.tweakId as string], revert: [] })}>
                Fix
              </Button>
            )}
          </CardRow>
        )
      })}
    </Card>
  )
}

export function ScanScreen() {
  const { scan, rescan, rescanning } = useAppData()
  const toast = useToast()
  const data = scan.data

  const copy = (): void => {
    if (data === null) return
    navigator.clipboard
      .writeText(buildReport(data))
      .then(() => toast.show({ title: 'Report copied', tone: 'ok' }))
      .catch(() => toast.show({ title: 'Could not copy the report', tone: 'error' }))
  }

  return (
    <Page label="System Scan">
      <PageHeader
        title="System Scan"
        eyebrow={data ? `Scanned ${formatWhen(data.info.scannedAt)} · read-only` : 'Reading your hardware · read-only'}
        actions={
          <>
            <Button variant="ghost" icon={<ClipboardCopy size={16} />} disabled={data === null} onClick={copy}>
              Copy report
            </Button>
            <Button variant="primary" icon={<RefreshCw size={16} />} loading={rescanning} onClick={() => rescan(true)}>
              Scan again
            </Button>
          </>
        }
      />
      {scan.status === 'error' && data === null && (
        <EmptyState
          tone="error"
          title="The scan failed"
          message={scan.error?.message}
          action={
            <Button size="sm" onClick={() => rescan(true)}>
              Try again
            </Button>
          }
        />
      )}
      {data === null && scan.status === 'loading' && (
        <div className="rl-row" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i} className="rl-scan__card">
              <Skeleton height={26} width="70%" />
              <Skeleton height={90} />
            </Card>
          ))}
        </div>
      )}
      {data !== null && (
        <>
          <HardwareCards info={data.info} />
          <div className="rl-row">
            <PlatformCard info={data.info} />
            <FindingsCard health={data.health} />
          </div>
        </>
      )}
    </Page>
  )
}
