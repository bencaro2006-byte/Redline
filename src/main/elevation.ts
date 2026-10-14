// Elevation check from Node (spec §7). Mandatory-label SIDs are locale independent:
// S-1-16-12288 = High, S-1-16-16384 = System.
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { hardenedEnv, safeSystemRoot } from './ps/env'

const WHOAMI = join(safeSystemRoot(), 'System32', 'whoami.exe')
const ELEVATED_LABEL = /S-1-16-(12288|16384)/

let cached: Promise<boolean> | null = null

export function parseWhoamiGroups(stdout: string): boolean {
  return ELEVATED_LABEL.test(stdout)
}

function query(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  return new Promise((resolve) => {
    execFile(WHOAMI, ['/groups', '/fo', 'csv', '/nh'], { windowsHide: true, timeout: 5000, env: hardenedEnv() }, (err, stdout) =>
      resolve(!err && parseWhoamiGroups(stdout)),
    )
  })
}

/** Cached for the process lifetime: a running process cannot change its token's integrity level. */
export function isElevated(): Promise<boolean> {
  cached ??= query()
  return cached
}
