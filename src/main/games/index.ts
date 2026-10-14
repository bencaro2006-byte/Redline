// Per-game Windows settings (GPU preference, fullscreen optimizations, CPU priority).
// Profiles persist to dataFile('games'); registry changes go through engine probe/invoke
// and are journaled in the BackupStore (kind 'game') so they can always be undone.
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { z } from 'zod'
import type { UpdateGameReq } from '@shared/api'
import type { ApplyReport, BackupEntry, GameProfile, Snapshot } from '@shared/types'
import { getBackupStore, invoke, probe } from '../engine'
import { IpcError } from '../ipc/errors'
import { dataFile } from '../paths'
import { readJsonFile, writeJsonFileAtomic } from '../store/jsonFile'
import {
  FLAG_LABELS,
  GAME_FLAGS,
  MAX_EXE_PATH,
  addLayerFlag,
  changedFlags,
  cpuPriorityAction,
  gameKey,
  gpuPreferenceAction,
  layersAction,
  parseGameKey,
  removeLayerFlag,
  validateExePath,
  type GameFlag,
} from './actions'

export interface GameChangeOptions {
  dryRun: boolean
}

const MAX_GAMES = 100
const ABSENT: Snapshot = { kind: 'registry', exists: false, valueType: null, value: null }

const GameProfileSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  exePath: z.string().min(4).max(MAX_EXE_PATH),
  exeName: z.string().min(5).max(124),
  gpuHighPerformance: z.boolean(),
  disableFullscreenOptimizations: z.boolean(),
  highCpuPriority: z.boolean(),
})
const GamesFileSchema = z.object({ version: z.literal(1), games: z.array(GameProfileSchema) })

/** Stored profiles, re-validated: the exe name is always derived from a valid path (never trusted from disk). */
async function readGames(): Promise<GameProfile[]> {
  const { games } = await readJsonFile(dataFile('games'), GamesFileSchema, { version: 1, games: [] })
  return games.flatMap((game) => {
    const valid = validateExePath(game.exePath)
    return valid.ok ? [{ ...game, exePath: valid.path, exeName: valid.name }] : []
  })
}

async function writeGames(games: readonly GameProfile[]): Promise<void> {
  await writeJsonFileAtomic(dataFile('games'), { version: 1, games })
}

async function saveProfile(profile: GameProfile): Promise<void> {
  const games = await readGames()
  await writeGames(games.map((g) => (g.id === profile.id ? profile : g)))
}

async function requireProfile(id: string): Promise<GameProfile> {
  const profile = (await readGames()).find((g) => g.id === id)
  if (profile === undefined) throw new IpcError('NOT_FOUND', 'Unknown game.')
  return profile
}

export async function listGames(): Promise<GameProfile[]> {
  return readGames()
}

export async function hasGame(id: string): Promise<boolean> {
  return (await readGames()).some((g) => g.id === id)
}

/** Opens a native .exe picker parented to `parent`. Resolves null when cancelled. */
export async function addGame(parent: BrowserWindow | null): Promise<GameProfile | null> {
  const options: OpenDialogOptions = {
    title: 'Choose a game executable',
    buttonLabel: 'Add game',
    filters: [{ name: 'Programs', extensions: ['exe'] }],
    properties: ['openFile', 'dontAddToRecent'],
  }
  const picked = parent !== null ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  const [chosen] = picked.filePaths
  if (picked.canceled || chosen === undefined) return null

  const valid = validateExePath(chosen)
  if (!valid.ok) throw new IpcError('INVALID_INPUT', valid.error)
  const info = await stat(valid.path).catch(() => null)
  if (info === null || !info.isFile()) throw new IpcError('INVALID_INPUT', 'That file could not be read.')

  const games = await readGames()
  const existing = games.find((g) => g.exePath.toLowerCase() === valid.path.toLowerCase())
  if (existing !== undefined) return existing
  const sameName = games.find((g) => g.exeName.toLowerCase() === valid.name.toLowerCase())
  if (sameName !== undefined) {
    throw new IpcError('INVALID_INPUT', `Another game already uses the file name ${valid.name}. Windows applies CPU priority by file name, so Redline can manage only one of them.`)
  }
  if (games.length >= MAX_GAMES) throw new IpcError('INVALID_INPUT', `Up to ${MAX_GAMES} games are supported.`)

  const profile: GameProfile = {
    id: randomUUID(),
    exePath: valid.path,
    exeName: valid.name,
    gpuHighPerformance: false,
    disableFullscreenOptimizations: false,
    highCpuPriority: false,
  }
  await writeGames([...games, profile])
  return profile
}

/** Newest unreverted journal entry that recorded `key`. */
async function openEntryFor(key: string): Promise<BackupEntry | undefined> {
  const entries = await getBackupStore().list()
  return entries.find((e) => e.kind === 'game' && e.revertedAt === null && e.items.some((i) => i.key === key))
}

async function runOne(item: Parameters<typeof invoke>[0][number], dryRun: boolean): Promise<void> {
  const [result] = await invoke([item], dryRun)
  if (result === undefined || !result.ok) throw new IpcError('FAILED', result?.error ?? 'The change could not be applied.')
}

async function setFullscreenFlag(profile: GameProfile, on: boolean, dryRun: boolean): Promise<void> {
  const key = gameKey(profile.id, 'disableFullscreenOptimizations')
  const before = (await probe([{ key, action: layersAction(profile, '') }])).get(key)
  if (before === undefined || before.kind !== 'registry') throw new IpcError('FAILED', 'Could not read the current compatibility flags.')
  const current = before.exists && typeof before.value === 'string' ? before.value : null

  if (on) {
    const action = layersAction(profile, addLayerFlag(current))
    if (!dryRun) await getBackupStore().append({ kind: 'game', label: `${profile.exeName}: ${FLAG_LABELS.disableFullscreenOptimizations}`, tweakIds: [`game-${profile.id}`], items: [{ key, action, before }] })
    await runOne({ key, op: 'set', action }, dryRun)
    return
  }
  // Remove only our flag so compatibility flags set elsewhere survive.
  const remaining = removeLayerFlag(current)
  const restore: Snapshot = remaining === null ? ABSENT : { kind: 'registry', exists: true, valueType: 'REG_SZ', value: remaining }
  await runOne({ key, op: 'restore', action: layersAction(profile, remaining ?? ''), restore }, dryRun)
  const entry = await openEntryFor(key)
  if (!dryRun && entry !== undefined) await getBackupStore().markReverted(entry.id)
}

async function setSimpleFlag(profile: GameProfile, flag: Exclude<GameFlag, 'disableFullscreenOptimizations'>, on: boolean, dryRun: boolean): Promise<void> {
  const key = gameKey(profile.id, flag)
  const action = flag === 'gpuHighPerformance' ? gpuPreferenceAction(profile) : cpuPriorityAction(profile)
  if (on) {
    const before = (await probe([{ key, action }])).get(key)
    if (before === undefined) throw new IpcError('FAILED', 'Could not read the current setting.')
    if (!dryRun) await getBackupStore().append({ kind: 'game', label: `${profile.exeName}: ${FLAG_LABELS[flag]}`, tweakIds: [`game-${profile.id}`], items: [{ key, action, before }] })
    await runOne({ key, op: 'set', action }, dryRun)
    return
  }
  const entry = await openEntryFor(key)
  const journaled = entry?.items.find((i) => i.key === key)?.before
  if (entry !== undefined && journaled !== undefined) {
    await runOne({ key, op: 'restore', action, restore: journaled }, dryRun)
    if (!dryRun) await getBackupStore().markReverted(entry.id)
    return
  }
  // No saved value: remove the setting only if it is still exactly what Redline writes,
  // so a value someone else set is never deleted.
  const current = (await probe([{ key, action }])).get(key)
  const ours = current?.kind === 'registry' && current.exists && current.valueType === action.valueType && current.value === action.value
  if (ours) await runOne({ key, op: 'restore', action, restore: ABSENT }, dryRun)
}

async function setFlag(profile: GameProfile, flag: GameFlag, on: boolean, dryRun: boolean): Promise<void> {
  if (flag === 'disableFullscreenOptimizations') await setFullscreenFlag(profile, on, dryRun)
  else await setSimpleFlag(profile, flag, on, dryRun)
}

export async function updateGame(req: UpdateGameReq, options: GameChangeOptions): Promise<GameProfile> {
  let current = await requireProfile(req.id)
  for (const change of changedFlags(current, req)) {
    await setFlag(current, change.flag, change.on, options.dryRun)
    if (!options.dryRun) {
      current = { ...current, [change.flag]: change.on }
      await saveProfile(current)
    }
  }
  return current
}

/**
 * Backups-screen revert of a game entry. When the game's flag is still on, it is turned off
 * through the normal game logic, so the profile stays in sync and only Redline's own change
 * is removed (other compatibility flags survive). Otherwise `fallback` (the engine's plain
 * restore of the saved value) runs.
 */
export async function revertGameEntry(entry: BackupEntry, options: GameChangeOptions, fallback: () => Promise<ApplyReport>): Promise<ApplyReport> {
  const [item] = entry.items
  const parts = entry.items.length === 1 && item !== undefined ? parseGameKey(item.key) : null
  const profile = parts !== null ? (await readGames()).find((g) => g.id === parts.gameId) : undefined
  if (parts === null || profile === undefined || !profile[parts.flag]) return fallback()

  await setFlag(profile, parts.flag, false, options.dryRun)
  if (!options.dryRun) await saveProfile({ ...profile, [parts.flag]: false })
  return {
    backupId: entry.id,
    restorePoint: null,
    results: [{ tweakId: `game-${profile.id}-${parts.flag}`, ok: true, changed: true, requiresReboot: false, dryRun: options.dryRun }],
    rebootRequired: false,
  }
}

/** Reverts the game's registry changes, then forgets the profile. */
export async function removeGame(id: string, options: GameChangeOptions): Promise<true> {
  const profile = await requireProfile(id)
  for (const flag of GAME_FLAGS) {
    if (profile[flag]) await setFlag(profile, flag, false, options.dryRun)
  }
  if (!options.dryRun) await writeGames((await readGames()).filter((g) => g.id !== id))
  return true
}
