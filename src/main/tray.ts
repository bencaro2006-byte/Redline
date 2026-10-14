// Tray icon + close-to-tray (spec §9). The close behaviour follows the closeToTray setting.
import { app, Menu, Tray, nativeImage, type BrowserWindow } from 'electron'
import { createLogger } from './log'
import { trayIconPath } from './paths'
import { showWindow } from './window'

const log = createLogger('tray')

let tray: Tray | null = null // module scope: an unreferenced Tray is garbage-collected and vanishes
let quitting = false

app.on('before-quit', () => {
  quitting = true
})

export function isQuitting(): boolean {
  return quitting
}

export interface TrayOptions {
  /** Read on every close so a settings change applies immediately. */
  closeToTray(): boolean
}

export function createTray(win: BrowserWindow, options: TrayOptions): void {
  const icon = nativeImage.createFromPath(trayIconPath())
  if (icon.isEmpty()) log.warn('tray icon missing or unreadable', trayIconPath())
  tray = new Tray(icon)
  tray.setToolTip('Redline Optimizer')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Redline Optimizer', click: () => showWindow(win) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  )
  tray.on('click', () => (win.isVisible() ? win.hide() : showWindow(win)))

  win.on('close', (event) => {
    if (quitting || !options.closeToTray()) return
    event.preventDefault()
    win.hide()
  })
  win.on('closed', () => destroyTray())
}

export function destroyTray(): void {
  if (tray !== null && !tray.isDestroyed()) tray.destroy()
  tray = null
}
