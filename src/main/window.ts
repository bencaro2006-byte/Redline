// Main window: hidden title bar + native Window Controls Overlay (spec §4).
import { app, BrowserWindow } from 'electron'
import { preloadPath, rendererIndexPath } from './paths'
import { createLogger } from './log'

const log = createLogger('window')

export const THEME = {
  background: '#0B0C0E',
  titleBar: '#0E1013',
  titleBarSymbol: '#9AA1AC',
  titleBarHeight: 48,
} as const

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow !== null && !mainWindow.isDestroyed() ? mainWindow : null
}

export function showWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'Redline Optimizer',
    backgroundColor: THEME.background,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: THEME.titleBar, symbolColor: THEME.titleBarSymbol, height: THEME.titleBarHeight },
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  })

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  win.webContents.on('render-process-gone', (_event, details) => log.error('renderer gone', details.reason, details.exitCode))

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const load = !app.isPackaged && devUrl ? win.loadURL(devUrl) : win.loadFile(rendererIndexPath())
  load.catch((err: unknown) => log.error('failed to load renderer', err))

  mainWindow = win
  return win
}
