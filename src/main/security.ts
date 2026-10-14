// Security defaults (spec §5): navigation lock, window-open deny, no webviews,
// all permission requests denied, and a safe external-link opener.
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, session, shell, type WebContents } from 'electron'
import { createLogger } from './log'
import { isElevated } from './elevation'
import { rendererIndexPath } from './paths'
import { hardenedEnv, safeSystemRoot } from './ps/env'

const log = createLogger('security')
const EXPLORER = join(safeSystemRoot(), 'explorer.exe')

let externalHosts: ReadonlySet<string> = new Set(['www.nvidia.com', 'learn.microsoft.com', 'support.microsoft.com'])

/** Hosts the app may open in the browser. index.ts adds the hosts of the bundled catalog's sources. */
export function setExternalHostAllowlist(hosts: Iterable<string>): void {
  externalHosts = new Set([...externalHosts, ...hosts])
}

function devRendererUrl(): string | null {
  const url = process.env['ELECTRON_RENDERER_URL']
  return !app.isPackaged && url ? url : null
}

export function isAppUrl(url: string): boolean {
  const dev = devRendererUrl()
  try {
    // Compare origins, not prefixes: "http://localhost:5173@evil.test/" starts with the dev URL.
    if (dev !== null) return new URL(url).origin === new URL(dev).origin
    const parsed = new URL(url)
    parsed.hash = ''
    return parsed.href === pathToFileURL(rendererIndexPath()).href
  } catch {
    return false
  }
}

export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' && externalHosts.has(parsed.hostname)
  } catch {
    return false
  }
}

/**
 * Opens an allowlisted https URL. When elevated, hands it to explorer.exe so the
 * browser starts with the user's normal token instead of inheriting admin (spec §5).
 */
export async function openExternalSafe(url: string): Promise<boolean> {
  if (!isAllowedExternalUrl(url)) {
    log.warn('blocked external URL', url)
    return false
  }
  const href = new URL(url).href
  if (await isElevated()) {
    const child = spawn(EXPLORER, [href], { shell: false, windowsHide: true, detached: true, stdio: 'ignore', env: hardenedEnv() })
    child.on('error', (err) => log.error('explorer.exe failed to open URL', err))
    child.unref()
    return true
  }
  await shell.openExternal(href)
  return true
}

function hardenContents(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    void openExternalSafe(url).catch((err: unknown) => log.error('openExternalSafe failed', err))
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault()
      log.warn('blocked navigation', url)
    }
  })
  contents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
}

/** Call before app 'ready'. */
export function installAppSecurity(): void {
  app.on('web-contents-created', (_event, contents) => hardenContents(contents))
}

/** The only permission granted: writing text to the clipboard ("Copy report"), and only to the app page. */
export function isPermissionAllowed(permission: string, pageUrl: string | null): boolean {
  return permission === 'clipboard-sanitized-write' && pageUrl !== null && isAppUrl(pageUrl)
}

/** Call after app 'ready'. */
export function installSessionSecurity(): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((wc, permission, callback) => callback(isPermissionAllowed(permission, wc.getURL())))
  ses.setPermissionCheckHandler((wc, permission) => isPermissionAllowed(permission, wc?.getURL() ?? null))
  ses.setDevicePermissionHandler(() => false)
}
