// Pure helpers for per-game Windows settings (no IO, unit-tested).
//  - GPU preference:   HKCU\Software\Microsoft\DirectX\UserGpuPreferences, value = exe path, "GpuPreference=2;"
//  - Fullscreen opt.:  HKCU\...\AppCompatFlags\Layers, value = exe path, "~ DISABLEDXMAXIMIZEDWINDOWEDMODE" merged with other flags
//  - CPU priority:     HKLM\...\Image File Execution Options\<exe name>\PerfOptions, CpuPriorityClass = 3 (High)
import { basename, isAbsolute, normalize } from 'node:path'
import type { RegistryAction } from '@shared/catalog'
import type { GameProfile } from '@shared/types'

export const GPU_PREF_PATH = 'Software\\Microsoft\\DirectX\\UserGpuPreferences'
export const GPU_PREF_HIGH = 'GpuPreference=2;'
export const LAYERS_PATH = 'Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers'
export const FSO_FLAG = 'DISABLEDXMAXIMIZEDWINDOWEDMODE'
export const IFEO_PATH = 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options'
export const CPU_PRIORITY_HIGH = 3

/** Registry value names are capped at 256 chars by the journal schema; keep a margin. */
export const MAX_EXE_PATH = 240
const EXE_NAME = /^[\w .()+-]{1,120}\.exe$/i

export type GameFlag = 'gpuHighPerformance' | 'disableFullscreenOptimizations' | 'highCpuPriority'
export const GAME_FLAGS: readonly GameFlag[] = ['gpuHighPerformance', 'disableFullscreenOptimizations', 'highCpuPriority']

export const FLAG_LABELS: Readonly<Record<GameFlag, string>> = {
  gpuHighPerformance: 'High-performance GPU',
  disableFullscreenOptimizations: 'Fullscreen optimizations off',
  highCpuPriority: 'High CPU priority',
}

/** Validates a picked file path. Returns the normalized path or an error message. */
export function validateExePath(path: string): { ok: true; path: string; name: string } | { ok: false; error: string } {
  if (!isAbsolute(path)) return { ok: false, error: 'Choose a file on a local drive.' }
  const normalized = normalize(path)
  if (normalized.startsWith('\\\\')) return { ok: false, error: 'Network paths are not supported.' }
  if (normalized.length > MAX_EXE_PATH) return { ok: false, error: 'That path is too long.' }
  const name = basename(normalized)
  if (!EXE_NAME.test(name)) return { ok: false, error: 'Choose a program (.exe) with a simple file name.' }
  if (/[*?"<>|]/.test(normalized)) return { ok: false, error: 'That path contains characters Windows settings cannot store.' }
  return { ok: true, path: normalized, name }
}

/** Journal/action key for one flag of one game, e.g. "game-<id>-highCpuPriority#0". */
export function gameKey(gameId: string, flag: GameFlag): string {
  return `game-${gameId}-${flag}#0`
}

export function gpuPreferenceAction(profile: GameProfile): RegistryAction {
  return { type: 'registry', hive: 'HKCU', path: GPU_PREF_PATH, name: profile.exePath, valueType: 'REG_SZ', value: GPU_PREF_HIGH, default: null }
}

export function cpuPriorityAction(profile: GameProfile): RegistryAction {
  return {
    type: 'registry',
    hive: 'HKLM',
    path: `${IFEO_PATH}\\${profile.exeName}\\PerfOptions`,
    name: 'CpuPriorityClass',
    valueType: 'REG_DWORD',
    value: CPU_PRIORITY_HIGH,
    default: null,
  }
}

/** A Layers action that writes `value` (the merged flag string). */
export function layersAction(profile: GameProfile, value: string): RegistryAction {
  return { type: 'registry', hive: 'HKCU', path: LAYERS_PATH, name: profile.exePath, valueType: 'REG_SZ', value, default: null }
}

/** "~ RUNASADMIN" + flag -> "~ RUNASADMIN DISABLEDXMAXIMIZEDWINDOWEDMODE" (idempotent). */
export function addLayerFlag(current: string | null, flag: string = FSO_FLAG): string {
  const tokens = (current ?? '').split(/\s+/).filter((t) => t.length > 0)
  const flags = tokens.filter((t) => t !== '~')
  const hasTilde = tokens.includes('~') || tokens.length === 0
  const merged = flags.some((f) => f.toUpperCase() === flag) ? flags : [...flags, flag]
  return [...(hasTilde ? ['~'] : []), ...merged].join(' ')
}

/** Removes the flag; returns null when no flags remain (the value should be deleted). */
export function removeLayerFlag(current: string | null, flag: string = FSO_FLAG): string | null {
  const tokens = (current ?? '').split(/\s+/).filter((t) => t.length > 0)
  const remaining = tokens.filter((t) => t !== '~' && t.toUpperCase() !== flag)
  if (remaining.length === 0) return null
  return [...(tokens.includes('~') ? ['~'] : []), ...remaining].join(' ')
}

const GAME_KEY = /^game-[A-Za-z0-9_-]{1,64}-(gpuHighPerformance|disableFullscreenOptimizations|highCpuPriority)#0$/
const GAME_KEY_PARTS = /^game-([A-Za-z0-9_-]{1,64})-(gpuHighPerformance|disableFullscreenOptimizations|highCpuPriority)#0$/

/** "game-<id>-<flag>#0" -> { gameId, flag }, or null for any other key. */
export function parseGameKey(key: string): { gameId: string; flag: GameFlag } | null {
  const match = GAME_KEY_PARTS.exec(key)
  if (match === null || match[1] === undefined || match[2] === undefined) return null
  return { gameId: match[1], flag: match[2] as GameFlag }
}

/**
 * Whether a journaled game action is one Redline itself could have written. Revert never
 * trusts actions read from disk: anything outside these three registry shapes is rejected.
 */
export function isAllowedGameAction(key: string, action: unknown): boolean {
  if (!GAME_KEY.test(key) || typeof action !== 'object' || action === null) return false
  const a = action as Partial<RegistryAction>
  if (a.type !== 'registry' || typeof a.name !== 'string' || typeof a.path !== 'string') return false
  const exe = validateExePath(a.name)
  if (a.hive === 'HKCU' && (a.path === GPU_PREF_PATH || a.path === LAYERS_PATH)) return a.valueType === 'REG_SZ' && exe.ok && exe.path === a.name
  if (a.hive !== 'HKLM' || a.name !== 'CpuPriorityClass' || a.valueType !== 'REG_DWORD') return false
  const prefix = `${IFEO_PATH}\\`
  const suffix = '\\PerfOptions'
  if (!a.path.startsWith(prefix) || !a.path.endsWith(suffix)) return false
  return EXE_NAME.test(a.path.slice(prefix.length, -suffix.length))
}

/** Flags whose value differs between the stored profile and the request. */
export function changedFlags(current: GameProfile, next: Readonly<Record<GameFlag, boolean>>): { flag: GameFlag; on: boolean }[] {
  return GAME_FLAGS.filter((flag) => current[flag] !== next[flag]).map((flag) => ({ flag, on: next[flag] }))
}
