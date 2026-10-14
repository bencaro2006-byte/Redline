// Plain-text system report for "Copy report" (pure, unit-tested).
import type { ScanResult } from '@shared/api'
import { ratedSpeedFromPartNumber } from '@shared/hardware'
import { formatDiskSize } from '../lib/format'

const GIB = 1024 ** 3

export function buildReport({ info, health }: ScanResult): string {
  const gpu = info.gpus.find((g) => g.nvidiaDriver !== null) ?? info.gpus[0]
  const modules = info.memory.modules
  const running = modules.length > 0 ? Math.min(...modules.map((m) => m.configuredMTs || m.speedMTs)) : null
  const rated = Math.max(0, ...modules.map((m) => ratedSpeedFromPartNumber(m.partNumber) ?? 0)) || null
  const display = info.displays[0]
  const lines = [
    `Redline Optimizer system report (${info.scannedAt})`,
    '',
    `CPU        ${info.cpu.name} (${info.cpu.cores} cores / ${info.cpu.threads} threads)`,
    gpu ? `GPU        ${gpu.name}${gpu.nvidiaDriver ? `, driver ${gpu.nvidiaDriver}` : ''}${gpu.vramBytes ? `, ${Math.round(gpu.vramBytes / GIB)} GB` : ''}` : null,
    `Memory     ${Math.round(info.memory.totalBytes / GIB)} GB, ${modules.length} module(s)${running ? ` at ${running} MT/s` : ''}${rated ? ` (rated ${rated})` : ''}`,
    ...info.disks.map((d) => `Disk       ${d.model} ${formatDiskSize(d.sizeBytes)} ${d.mediaType} ${d.busType}${d.isSystem ? ' (system)' : ''}`),
    `Board      ${info.board.manufacturer} ${info.board.product}, BIOS ${info.bios.version}${info.bios.releaseDate ? ` (${info.bios.releaseDate.slice(0, 10)})` : ''}`,
    `Windows    ${info.os.caption} ${info.os.displayVersion ?? ''} build ${info.os.build}`.replace(/\s+/g, ' '),
    display ? `Display    ${display.width} x ${display.height} @ ${display.refreshHz} Hz` : null,
    `Power plan ${info.power.activeSchemeName}`,
    '',
    'Findings',
    ...health.map((h) => `  [${h.status.toUpperCase()}] ${h.title}: ${h.detail}`),
  ]
  return lines.filter((line): line is string => line !== null).join('\n')
}
