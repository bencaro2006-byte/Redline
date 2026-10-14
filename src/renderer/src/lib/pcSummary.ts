// Short human labels for the hardware in a SystemInfo (pure).
import type { SystemInfo } from '@shared/types'
import { formatDiskSize } from './format'

const GIB = 1024 ** 3

/** "Intel(R) Core(TM) i7-7700 CPU @ 3.60GHz" -> "i7-7700". */
export function shortCpuName(name: string): string {
  const cleaned = name
    .replace(/\((R|TM|C)\)/gi, '')
    .replace(/\s+CPU\b.*$/i, '')
    .replace(/\s+@.*$/, '')
    .replace(/^(Intel|AMD)\s+/i, '')
    .replace(/^(Core|Ryzen\s+\d)\s+/i, (m) => (m.toLowerCase().startsWith('ryzen') ? m : ''))
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > 0 ? cleaned : name
}

/** "NVIDIA GeForce GTX 1070" -> "GTX 1070". */
export function shortGpuName(name: string): string {
  return name.replace(/^(NVIDIA|AMD|Intel\(R\)|Intel)\s+/i, '').replace(/^(GeForce|Radeon)\s+/i, '').trim() || name
}

const DISK_FAMILIES = /(MX500|BX500|MX300|P[1-5]|T500|870 EVO|860 EVO|970 EVO(?: Plus)?|980 PRO|990 PRO|SN\d{3,4}|A400|KC\d{4}|NV\d)/i

/** "CT1000MX500SSD1" -> "MX500"; falls back to the model string. */
export function shortDiskModel(model: string): string {
  return DISK_FAMILIES.exec(model)?.[1] ?? model.trim()
}

/** "Microsoft Windows 10 Pro" + 22H2 -> "Win10 22H2" (builds >= 22000 are Windows 11). */
export function shortOsName(os: SystemInfo['os']): string {
  const major = Number(os.build) >= 22000 ? '11' : '10'
  return `Win${major}${os.displayVersion ? ` ${os.displayVersion}` : ''}`
}

export function summarizePc(info: SystemInfo): { headline: string; detail: string } {
  const gpu = info.gpus.find((g) => g.nvidiaDriver !== null) ?? info.gpus[0]
  const disk = info.disks.find((d) => d.isSystem) ?? info.disks[0]
  const headline = [shortCpuName(info.cpu.name), gpu ? shortGpuName(gpu.name) : null].filter(Boolean).join(' · ')
  const detail = [
    `${Math.round(info.memory.totalBytes / GIB)} GB`,
    disk ? `${shortDiskModel(disk.model)} ${formatDiskSize(disk.sizeBytes)}` : null,
    shortOsName(info.os),
  ]
    .filter(Boolean)
    .join(' · ')
  return { headline, detail }
}
