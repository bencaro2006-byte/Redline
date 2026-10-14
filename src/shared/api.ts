// Renderer <-> main contract. Types and constants only: no runtime dependencies.
import type { Catalog } from './catalog'
import type {
  AppStatus,
  AppxState,
  ApplyReport,
  BackupEntry,
  GameProfile,
  HealthCheck,
  LiveMetrics,
  RestorePointResult,
  Settings,
  SystemInfo,
  TweakState,
} from './types'

export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export type ErrorCode =
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'NOT_ELEVATED'
  | 'NOT_FOUND'
  | 'BUSY'
  | 'NOT_IMPLEMENTED'
  | 'FAILED'

export interface TaskProgress {
  task: string
  message: string
  done: number
  total: number
}

export interface ScanResult {
  info: SystemInfo
  health: HealthCheck[]
}

export type ApplyMode = 'apply' | 'revert'

export interface ApplyTweaksReq {
  ids: string[]
  mode: ApplyMode
}

export interface RemoveAppxResult {
  removed: string[]
  failed: { package: string; error: string }[]
  dryRun: boolean
}

export interface UpdateGameReq {
  id: string
  gpuHighPerformance: boolean
  disableFullscreenOptimizations: boolean
  highCpuPriority: boolean
}

export interface RedlineApi {
  getStatus(): Promise<Result<AppStatus>>
  getCatalog(): Promise<Result<Catalog>>
  scanSystem(req: { force: boolean }): Promise<Result<ScanResult>>
  detectTweaks(): Promise<Result<TweakState[]>>
  applyTweaks(req: ApplyTweaksReq): Promise<Result<ApplyReport>>
  listBackups(): Promise<Result<BackupEntry[]>>
  revertBackup(req: { backupId: string }): Promise<Result<ApplyReport>>
  createRestorePoint(): Promise<Result<RestorePointResult>>
  listAppx(): Promise<Result<AppxState[]>>
  removeAppx(req: { packages: string[] }): Promise<Result<RemoveAppxResult>>
  listGames(): Promise<Result<GameProfile[]>>
  /** Main opens the file dialog; the renderer never sends paths. null = dialog cancelled. */
  addGame(): Promise<Result<GameProfile | null>>
  updateGame(req: UpdateGameReq): Promise<Result<GameProfile>>
  /** Also reverts that game's registry changes. */
  removeGame(req: { id: string }): Promise<Result<true>>
  getSettings(): Promise<Result<Settings>>
  setSettings(req: Partial<Settings>): Promise<Result<Settings>>
  openNvidiaControlPanel(): Promise<Result<true>>
  /** Subscribing starts the sampler; the last unsubscribe stops it. Returns unsubscribe. */
  onLiveMetrics(cb: (m: LiveMetrics) => void): () => void
  /** Returns unsubscribe. */
  onTaskProgress(cb: (p: TaskProgress) => void): () => void
}

/** Invoke channels (renderer -> main, request/response). */
export const IPC = {
  getStatus: 'status:get',
  getCatalog: 'catalog:get',
  scanSystem: 'scan:run',
  detectTweaks: 'tweaks:detect',
  applyTweaks: 'tweaks:apply',
  listBackups: 'backups:list',
  revertBackup: 'backups:revert',
  createRestorePoint: 'restore:create',
  listAppx: 'appx:list',
  removeAppx: 'appx:remove',
  listGames: 'games:list',
  addGame: 'games:add',
  updateGame: 'games:update',
  removeGame: 'games:remove',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  openNvidiaControlPanel: 'nvidia:open',
} as const

export type InvokeChannel = (typeof IPC)[keyof typeof IPC]

/** Fire-and-forget channels (renderer -> main) and push events (main -> renderer). */
export const IPC_EVENTS = {
  metricsSubscribe: 'metrics:subscribe',
  metricsUnsubscribe: 'metrics:unsubscribe',
  metrics: 'metrics:sample',
  taskProgress: 'task:progress',
} as const
