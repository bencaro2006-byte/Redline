// Shared domain types. Types only: no runtime dependencies.
import type { AppxEntry, RegValue, RegValueType, ServiceStart, TweakAction } from './catalog'

export interface CpuInfo {
  name: string
  cores: number
  threads: number
  baseMHz: number
  vendor: string
}

export interface GpuInfo {
  name: string
  driverVersion: string
  nvidiaDriver: string | null
  vramBytes: number | null
}

export interface MemoryModule {
  capacityBytes: number
  speedMTs: number
  configuredMTs: number
  manufacturer: string
  partNumber: string
  slot: string
}

export interface DiskInfo {
  model: string
  mediaType: string
  busType: string
  sizeBytes: number
  isSystem: boolean
}

export interface VolumeInfo {
  letter: string
  sizeBytes: number
  freeBytes: number
}

export interface DisplayInfo {
  name: string
  width: number
  height: number
  refreshHz: number
}

export interface SystemInfo {
  scannedAt: string
  computerName: string
  cpu: CpuInfo
  gpus: GpuInfo[]
  memory: { totalBytes: number; modules: MemoryModule[] }
  disks: DiskInfo[]
  volumes: VolumeInfo[]
  board: { manufacturer: string; product: string }
  bios: { version: string; releaseDate: string | null }
  os: { caption: string; version: string; build: string; displayVersion: string | null }
  displays: DisplayInfo[]
  power: { activeSchemeGuid: string; activeSchemeName: string }
  security: { defenderRealtime: boolean | null; vbsRunning: boolean | null }
  gaming: {
    gameModeOn: boolean | null
    gameDvrOn: boolean | null
    hagsOn: boolean | null
    trimEnabled: boolean | null
  }
}

export type HealthStatus = 'ok' | 'fix' | 'info'

export interface HealthCheck {
  id: string
  status: HealthStatus
  title: string
  detail: string
  tweakId?: string
}

export type TweakStateKind = 'applied' | 'not-applied' | 'partial' | 'not-applicable' | 'unknown'

export interface TweakState {
  id: string
  state: TweakStateKind
  detail?: string
}

export interface ApplyItemResult {
  tweakId: string
  ok: boolean
  /** false when every setting was already at its target (nothing to do). */
  changed: boolean
  error?: string
  requiresReboot: boolean
  dryRun: boolean
}

export interface RestorePointResult {
  created: boolean
  skippedRecent: boolean
  latestCreatedAt: string | null
  warning: string
}

export interface ApplyReport {
  backupId: string | null
  restorePoint: RestorePointResult | null
  results: ApplyItemResult[]
  rebootRequired: boolean
}

/** What Get-TweakState.ps1 reports for one action (discriminated by kind). */
export type Snapshot =
  | { kind: 'registry'; exists: boolean; valueType: RegValueType | null; value: RegValue | null }
  | { kind: 'service'; exists: boolean; startType: ServiceStart | null }
  | { kind: 'scheduledTask'; exists: boolean; enabled: boolean | null }
  | { kind: 'powercfg'; exists: boolean; ac: number | null; dc: number | null; schemeGuid: string }
  | { kind: 'powerScheme'; activeGuid: string; activeName: string; isUltimate: boolean; createdGuid?: string | null }
  | { kind: 'command'; detected: boolean | null }

export type SnapshotKind = Snapshot['kind']

export interface BackupItem {
  key: string
  action: TweakAction
  before: Snapshot
}

export interface BackupEntry {
  id: string
  createdAt: string
  tweakIds: string[]
  kind: 'tweaks' | 'game'
  label: string
  items: BackupItem[]
  revertedAt: string | null
}

export interface LiveMetrics {
  at: string
  cpuLoad: number
  cpuClockMHz: number | null
  memUsedBytes: number
  memTotalBytes: number
  gpuLoad: number | null
  gpuMemUsedBytes: number | null
}

export interface GameProfile {
  id: string
  exePath: string
  exeName: string
  gpuHighPerformance: boolean
  disableFullscreenOptimizations: boolean
  highCpuPriority: boolean
}

export interface AppxState extends AppxEntry {
  installed: boolean
}

export interface Settings {
  dryRun: boolean
  restorePointBeforeApply: boolean
  closeToTray: boolean
}

export interface AppStatus {
  elevated: boolean
  dryRun: boolean
  appVersion: string
  platformOk: boolean
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  dryRun: true,
  restorePointBeforeApply: true,
  closeToTray: false,
}
