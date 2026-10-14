// Wires every RedlineApi method to its owning module. Each handler: trusted sender,
// zod-validated request, Result<T> envelope (see handle.ts). System-changing calls
// need elevation unless dry-run is on, and run one at a time (mutex.ts).
import { app } from 'electron'
import { IPC } from '@shared/api'
import type { AppStatus, ApplyReport } from '@shared/types'
import * as appx from '../appx'
import { currentSettings, rememberSettings } from '../appState'
import { getCatalog } from '../catalog'
import { isElevated } from '../elevation'
import * as engine from '../engine'
import * as games from '../games'
import { openNvidiaControlPanel } from '../nvidia'
import { isSupportedPlatform } from '../platform'
import { emitProgress } from '../progress'
import * as scan from '../scan'
import * as settings from '../settings'
import { getMainWindow } from '../window'
import { IpcError } from './errors'
import { handle } from './handle'
import { registerMetricsIpc } from './metrics'
import { exclusive } from './mutex'
import * as S from './schemas'

async function requireElevated(action: string): Promise<void> {
  if (!(await isElevated())) throw new IpcError('NOT_ELEVATED', `${action} needs Redline to run as administrator.`)
}

/** Real changes need admin; dry runs only read, so they are allowed without it. */
async function requireElevatedUnlessDryRun(action: string): Promise<boolean> {
  const { dryRun } = currentSettings()
  if (!dryRun) await requireElevated(action)
  return dryRun
}

async function requireGame(id: string): Promise<void> {
  if (!(await games.hasGame(id))) throw new IpcError('NOT_FOUND', 'Unknown game.')
}

async function getStatus(): Promise<AppStatus> {
  return {
    elevated: await isElevated(),
    dryRun: currentSettings().dryRun,
    appVersion: app.getVersion(),
    platformOk: isSupportedPlatform(),
  }
}

function registerTweakHandlers(): void {
  handle(IPC.getCatalog, S.NoArgs, async () => getCatalog())
  handle(IPC.detectTweaks, S.NoArgs, () => engine.detectTweaks())
  handle(IPC.applyTweaks, S.ApplyTweaksReq, async (req) => {
    const dryRun = await requireElevatedUnlessDryRun(req.mode === 'apply' ? 'Applying optimizations' : 'Reverting optimizations')
    const restorePoint = req.mode === 'apply' && currentSettings().restorePointBeforeApply
    try {
      return await exclusive('apply', () => engine.applyTweaks(req, { dryRun, restorePoint, onProgress: emitProgress }))
    } finally {
      // Even a failed run may have changed something: never show a stale scan afterwards.
      if (!dryRun) await scan.invalidateScan()
    }
  })
  handle(IPC.listBackups, S.NoArgs, () => engine.listBackups())
  handle(IPC.revertBackup, S.RevertBackupReq, async (req) => {
    const dryRun = await requireElevatedUnlessDryRun('Reverting a backup')
    const options = { dryRun, restorePoint: false, onProgress: emitProgress }
    const revert = (): Promise<ApplyReport> => engine.revertBackup(req.backupId, options)
    try {
      return await exclusive('revert', async () => {
        const entry = await engine.getBackupStore().get(req.backupId)
        // Game entries go through the Games logic so the game's profile stays in sync.
        return entry?.kind === 'game' ? games.revertGameEntry(entry, { dryRun }, revert) : revert()
      })
    } finally {
      if (!dryRun) await scan.invalidateScan()
    }
  })
  handle(IPC.createRestorePoint, S.NoArgs, async () => {
    const dryRun = await requireElevatedUnlessDryRun('Creating a restore point')
    return exclusive('restore point', () => engine.createRestorePoint(engine.RESTORE_POINT_DESCRIPTION, { dryRun }))
  })
}

function registerSystemHandlers(): void {
  handle(IPC.getStatus, S.NoArgs, getStatus)
  handle(IPC.scanSystem, S.ScanReq, (req) => scan.scanSystem(req.force))
  handle(IPC.listAppx, S.NoArgs, () => appx.listAppx())
  handle(IPC.removeAppx, S.RemoveAppxReq, async (req) => {
    const dryRun = await requireElevatedUnlessDryRun('Removing apps')
    return exclusive('remove apps', () => appx.removeAppx(req.packages, dryRun))
  })
  handle(IPC.openNvidiaControlPanel, S.NoArgs, () => openNvidiaControlPanel())
  handle(IPC.getSettings, S.NoArgs, async () => rememberSettings(await settings.getSettings()))
  handle(IPC.setSettings, S.SettingsPatch, async (patch) => rememberSettings(await settings.setSettings(patch)))
}

function registerGameHandlers(): void {
  handle(IPC.listGames, S.NoArgs, () => games.listGames())
  handle(IPC.addGame, S.NoArgs, () => games.addGame(getMainWindow()))
  handle(IPC.updateGame, S.UpdateGameReq, async (req) => {
    await requireGame(req.id)
    const dryRun = await requireElevatedUnlessDryRun('Changing game settings')
    return exclusive('game settings', () => games.updateGame(req, { dryRun }))
  })
  handle(IPC.removeGame, S.RemoveGameReq, async (req) => {
    await requireGame(req.id)
    const dryRun = await requireElevatedUnlessDryRun('Removing a game')
    return exclusive('remove game', () => games.removeGame(req.id, { dryRun }))
  })
}

export function registerIpc(): void {
  registerSystemHandlers()
  registerTweakHandlers()
  registerGameHandlers()
  registerMetricsIpc()
}
