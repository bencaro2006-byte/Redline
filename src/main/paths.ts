// Filesystem locations. All app data lives under app.getPath('userData').
import { join } from 'node:path'
import { app } from 'electron'

export const DATA_FILES = {
  backups: 'backups.json',
  settings: 'settings.json',
  games: 'games.json',
  scanCache: 'scan-cache.json',
} as const

export type DataFileId = keyof typeof DATA_FILES

export function dataDir(): string {
  return app.getPath('userData')
}

export function dataFile(id: DataFileId): string {
  return join(dataDir(), DATA_FILES[id])
}

/** Bundled PowerShell scripts: extraResources when packaged, the repo folder in dev. */
export function scriptsDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'scripts') : join(app.getAppPath(), 'resources', 'scripts')
}

export function trayIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icons', 'tray.ico')
    : join(app.getAppPath(), 'resources', 'icons', 'tray.ico')
}

export function rendererIndexPath(): string {
  return join(__dirname, '../renderer/index.html')
}

export function preloadPath(): string {
  return join(__dirname, '../preload/index.js')
}
