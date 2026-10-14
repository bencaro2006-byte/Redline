// Health checks derived from a SystemInfo (pure, no IO).
// Status meaning: 'fix' = something worth changing (tweakId set when a catalog tweak does it),
// 'info' = a fact or a manual step (e.g. B250 caps memory at the CPU's rated speed),
// 'ok' = already good. Checks never suggest weakening security.
import { ratedSpeedFromPartNumber } from '@shared/hardware'
import type { HealthCheck, SystemInfo } from '@shared/types'

export const POWER_PLANS = {
  balanced: '381b4222-f694-41f0-9685-ff5bb260df2e',
  powerSaver: 'a1841308-3541-4fab-bc81-f71556f20b4a',
  highPerformance: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
  ultimate: 'e9a42b02-d5df-448d-aa00-03f14749eb61',
} as const

const LOW_FREE_SPACE_RATIO = 0.15
const GB = 1024 ** 3

export { ratedSpeedFromPartNumber }

/** Intel 100-400 series B/H boards run memory only at the CPU's rated speed (no XMP above it). */
export function boardLocksMemorySpeed(info: SystemInfo): boolean {
  // "B250M-DS3H-CF" -> B250 (the chipset number must not run on into more digits).
  return /Intel/i.test(info.cpu.vendor) && /^(B|H)(1[0-9]0|2[0-9]0|3[0-9][05]|4[0-9]0)(?![0-9])/i.test(info.board.product)
}

function chipsetName(product: string): string {
  return /^([BH]\d{3})/i.exec(product)?.[1]?.toUpperCase() ?? product
}

function powerPlanCheck(info: SystemInfo, tweak: (id: string) => string | undefined): HealthCheck | null {
  const guid = info.power.activeSchemeGuid.toLowerCase()
  const name = info.power.activeSchemeName || 'Unknown'
  if (guid === '') return null
  if (guid === POWER_PLANS.balanced || guid === POWER_PLANS.powerSaver) {
    const tweakId = tweak('ultimate-performance-plan')
    return { id: 'power-plan', status: 'fix', title: `Power plan: ${name}`, detail: 'A performance plan keeps the CPU ready instead of saving power between frames.', ...(tweakId ? { tweakId } : {}) }
  }
  if (guid === POWER_PLANS.highPerformance || guid === POWER_PLANS.ultimate || /ultimate|high performance/i.test(name)) {
    return { id: 'power-plan', status: 'ok', title: `Power plan: ${name}`, detail: 'A performance plan is active.' }
  }
  return { id: 'power-plan', status: 'info', title: `Power plan: ${name}`, detail: 'A custom power plan is active.' }
}

function memoryChecks(info: SystemInfo): HealthCheck[] {
  const modules = info.memory.modules
  if (modules.length === 0) return []
  const checks: HealthCheck[] = []
  const running = Math.min(...modules.map((m) => m.configuredMTs || m.speedMTs))
  const rated = Math.max(0, ...modules.map((m) => ratedSpeedFromPartNumber(m.partNumber) ?? 0))
  if (rated > running && running > 0) {
    checks.push(
      boardLocksMemorySpeed(info)
        ? {
            id: 'memory-speed',
            status: 'info',
            title: `Memory at ${running} MT/s`,
            detail: `The kit is rated ${rated}, but ${chipsetName(info.board.product)} boards run memory at the CPU's official speed. Enabling XMP won't raise it. Nothing to fix.`,
          }
        : {
            id: 'memory-speed',
            status: 'info',
            title: `Memory at ${running} MT/s (rated ${rated})`,
            detail: 'Enable the XMP / EXPO profile in the BIOS to run the memory at its rated speed.',
          },
    )
  } else {
    checks.push({ id: 'memory-speed', status: 'ok', title: `Memory at ${running} MT/s`, detail: 'Running at its configured speed.' })
  }

  const channels = new Set(modules.map((m) => /Channel\s*([A-Z])/i.exec(m.slot)?.[1]?.toUpperCase()).filter((c) => c !== undefined))
  if (modules.length === 1) {
    checks.push({ id: 'dual-channel', status: 'info', title: 'Single memory module', detail: 'A second matching module would enable dual-channel memory, which helps CPU-bound games.' })
  } else if (channels.size === 1) {
    checks.push({ id: 'dual-channel', status: 'info', title: 'Modules share one channel', detail: 'Both modules sit on the same memory channel. Check the motherboard manual for the dual-channel slots.' })
  } else {
    checks.push({ id: 'dual-channel', status: 'ok', title: 'Dual-channel memory', detail: `${modules.length} modules across ${Math.max(channels.size, 2)} channels.` })
  }
  return checks
}

function storageChecks(info: SystemInfo, tweak: (id: string) => string | undefined): HealthCheck[] {
  const checks: HealthCheck[] = []
  const systemDisk = info.disks.find((d) => d.isSystem)
  if (info.gaming.trimEnabled === false) {
    const tweakId = tweak('ssd-trim-on')
    checks.push({ id: 'trim', status: 'fix', title: 'SSD TRIM is off', detail: 'TRIM keeps an SSD fast as it fills up.', ...(tweakId ? { tweakId } : {}) })
  } else if (info.gaming.trimEnabled === true && systemDisk?.mediaType === 'SSD') {
    checks.push({ id: 'trim', status: 'ok', title: 'SSD TRIM enabled', detail: `${systemDisk.model} keeps its write speed over time.` })
  }
  const system = info.volumes.find((v) => v.letter.toUpperCase() === 'C:')
  if (system !== undefined && system.sizeBytes > 0) {
    const ratio = system.freeBytes / system.sizeBytes
    const free = `${Math.round(system.freeBytes / GB)} GB free of ${Math.round(system.sizeBytes / GB)} GB`
    checks.push(
      ratio < LOW_FREE_SPACE_RATIO
        ? { id: 'free-space', status: 'fix', title: `Drive C: is ${Math.round((1 - ratio) * 100)}% full`, detail: `${free}. Game updates and shader caches need room; free up space with Disk Cleanup or move games to another drive.` }
        : { id: 'free-space', status: 'ok', title: 'Plenty of free space', detail: `${free} on C:.` },
    )
  }
  return checks
}

function gamingChecks(info: SystemInfo, tweak: (id: string) => string | undefined): HealthCheck[] {
  const checks: HealthCheck[] = []
  const g = info.gaming
  if (g.gameDvrOn === true) {
    const tweakId = tweak('xbox-game-bar-off')
    checks.push({ id: 'game-dvr', status: 'fix', title: 'Game DVR is recording in the background', detail: 'Background capture uses GPU encoder time and disk writes while you play.', ...(tweakId ? { tweakId } : {}) })
  } else if (g.gameDvrOn === false) {
    checks.push({ id: 'game-dvr', status: 'ok', title: 'Background recording is off', detail: 'Windows is not capturing gameplay in the background.' })
  }
  if (g.gameModeOn === false) {
    checks.push({ id: 'game-mode', status: 'info', title: 'Game Mode is off', detail: 'Turn it on in Settings > Gaming > Game Mode so Windows prioritises the game you are playing.' })
  } else if (g.gameModeOn === true) {
    checks.push({ id: 'game-mode', status: 'ok', title: 'Game Mode is on', detail: 'Windows prioritises the game in focus.' })
  }
  if (g.hagsOn !== null) {
    checks.push({
      id: 'gpu-scheduling',
      status: 'info',
      title: `GPU scheduling is ${g.hagsOn ? 'on' : 'off'}`,
      detail: 'Hardware-accelerated GPU scheduling helps some games and not others. Compare both settings in the games you play.',
    })
  }
  return checks
}

function platformChecks(info: SystemInfo): HealthCheck[] {
  const checks: HealthCheck[] = []
  const nvidia = info.gpus.find((g) => g.nvidiaDriver !== null)
  if (nvidia?.nvidiaDriver) {
    checks.push({ id: 'gpu-driver', status: 'ok', title: `GPU driver ${nvidia.nvidiaDriver}`, detail: `${nvidia.name} has an NVIDIA driver installed.` })
  }
  const display = info.displays[0]
  if (display !== undefined) {
    checks.push(
      display.refreshHz > 60
        ? { id: 'refresh-rate', status: 'ok', title: `Display at ${display.refreshHz} Hz`, detail: `${display.width} × ${display.height} at ${display.refreshHz} Hz.` }
        : { id: 'refresh-rate', status: 'info', title: `Display at ${display.refreshHz} Hz`, detail: 'If your monitor supports more, raise it in Settings > Display > Advanced display settings.' },
    )
  }
  const year = info.bios.releaseDate !== null ? Number(info.bios.releaseDate.slice(0, 4)) : null
  if (year !== null && Number.isFinite(year) && year < 2020) {
    checks.push({
      id: 'bios',
      status: 'info',
      title: `BIOS ${info.bios.version} from ${year}`,
      detail: 'Newer BIOS releases include CPU microcode security fixes. Updating is optional; follow the motherboard maker’s instructions.',
    })
  }
  if (info.security.defenderRealtime === true) {
    checks.push({ id: 'defender', status: 'ok', title: 'Microsoft Defender protection is on', detail: 'Redline never turns off security features.' })
  } else if (info.security.defenderRealtime === false) {
    checks.push({ id: 'defender', status: 'info', title: 'Real-time protection is off', detail: 'Running without antivirus protection is not recommended. Redline does not change this setting.' })
  }
  return checks
}

const ORDER: Readonly<Record<HealthCheck['status'], number>> = { fix: 0, info: 1, ok: 2 }

/** Builds the checks; tweak ids are only attached when they exist in `knownTweakIds`. Sorted fix > info > ok. */
export function buildHealthChecks(info: SystemInfo, knownTweakIds: ReadonlySet<string> = new Set()): HealthCheck[] {
  const tweak = (id: string): string | undefined => (knownTweakIds.has(id) ? id : undefined)
  const plan = powerPlanCheck(info, tweak)
  const checks = [
    ...(plan ? [plan] : []),
    ...gamingChecks(info, tweak),
    ...storageChecks(info, tweak),
    ...memoryChecks(info),
    ...platformChecks(info),
  ]
  return checks.map((check, index) => ({ check, index })).sort((a, b) => ORDER[a.check.status] - ORDER[b.check.status] || a.index - b.index).map((x) => x.check)
}
