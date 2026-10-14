// Main process lifecycle: sandbox, single instance, security handlers, catalog
// validation, settings, IPC, window and tray.
import { app, dialog, Menu } from 'electron'
import { rememberSettings, currentSettings } from './appState'
import { getCatalog, sourceHosts } from './catalog'
import { isTrustedInstallLocation } from './installLocation'
import { registerIpc } from './ipc/register'
import { unsubscribeAllMetrics } from './ipc/metrics'
import { initLog, log } from './log'
import { setMetricsPaused, stopMetrics } from './monitor'
import { installAppSecurity, installSessionSecurity, setExternalHostAllowlist } from './security'
import { getSettings } from './settings'
import { createTray } from './tray'
import { createMainWindow, getMainWindow, showWindow } from './window'

export const APP_USER_MODEL_ID = 'com.redline.optimizer' // must equal electron-builder appId

app.enableSandbox() // before 'ready': forces the sandbox on every renderer
installAppSecurity()

async function loadInitialSettings(): Promise<void> {
  try {
    rememberSettings(await getSettings())
  } catch (err) {
    log.warn('settings unavailable, using defaults', err)
  }
}

function validateCatalogOrQuit(): boolean {
  try {
    getCatalog()
    setExternalHostAllowlist(sourceHosts())
    return true
  } catch (err) {
    log.error('bundled catalog is invalid', err)
    dialog.showErrorBox('Redline Optimizer', 'The bundled optimization catalog failed validation. Reinstall the app.')
    app.quit()
    return false
  }
}

/** The packaged app runs elevated: refuse to start from a folder normal users can modify. */
function checkInstallLocationOrQuit(): boolean {
  if (!app.isPackaged || isTrustedInstallLocation(process.resourcesPath)) return true
  log.error('refusing to run from an untrusted location', process.resourcesPath)
  dialog.showErrorBox(
    'Redline Optimizer',
    'Redline runs with administrator rights, so it only runs from its installed folder in Program Files. Please install it with the Redline installer.',
  )
  app.quit()
  return false
}

function shutdownBackground(): void {
  unsubscribeAllMetrics()
  try {
    stopMetrics()
  } catch (err) {
    log.debug('stopMetrics failed', err)
  }
}

async function onReady(): Promise<void> {
  initLog(app.getPath('logs'), app.isPackaged ? 'info' : 'debug')
  log.info(`starting Redline Optimizer ${app.getVersion()} (electron ${process.versions.electron})`)
  installSessionSecurity()
  Menu.setApplicationMenu(null) // drops the default menu and its accelerators (reload, devtools)
  if (!checkInstallLocationOrQuit()) return
  if (!validateCatalogOrQuit()) return
  await loadInitialSettings()
  registerIpc()
  const win = createMainWindow()
  createTray(win, { closeToTray: () => currentSettings().closeToTray })
  // No sensor polling while the window is out of sight (e.g. hidden in the tray during a game).
  win.on('hide', () => setMetricsPaused(true))
  win.on('minimize', () => setMetricsPaused(true))
  win.on('show', () => setMetricsPaused(false))
  win.on('restore', () => setMetricsPaused(false))
}

function start(): void {
  app.setAppUserModelId(APP_USER_MODEL_ID)
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win !== null) showWindow(win)
  })
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', shutdownBackground)
  app
    .whenReady()
    .then(onReady)
    .catch((err: unknown) => {
      log.error('startup failed', err)
      app.quit()
    })
}

if (app.requestSingleInstanceLock()) start()
else app.quit()
