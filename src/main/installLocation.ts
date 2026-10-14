// The packaged app runs elevated, so it must only run from an admin-only folder: anything a
// normal user can write to (a portable copy in %TEMP%, a custom folder) could be swapped
// for code that then runs as administrator. The installer always uses Program Files.
import { win32 } from 'node:path'
import { safeSystemRoot } from './ps/env'

/** "<system drive>:\Program Files" derived from the validated Windows directory. */
export function programFilesRoot(systemRoot: string = safeSystemRoot()): string {
  return `${systemRoot.slice(0, 2)}\\Program Files`
}

/** true when `resourcesPath` is inside Program Files on the system drive (pure). */
export function isTrustedInstallLocation(resourcesPath: string, root: string = programFilesRoot()): boolean {
  const normalized = win32.resolve(resourcesPath).toLowerCase()
  return normalized.startsWith(`${root.toLowerCase()}\\`)
}
