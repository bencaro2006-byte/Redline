// Script integrity: in the packaged app, every PowerShell script (and the shared helper it
// dot-sources) must match the SHA-256 embedded at build time before it is run elevated.
// Development builds skip the check because scripts change while you work on them.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { SCRIPT_SHA256 } from './scriptHashes'

export const COMMON_SCRIPT = 'Redline.Common.ps1'

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Checks `script` and the common helper in `dir`. `enforce` defaults to "running packaged". */
export function verifyScriptIntegrity(
  dir: string,
  script: string,
  enforce: boolean = app?.isPackaged === true,
  hashes: Readonly<Record<string, string>> = SCRIPT_SHA256,
): { ok: true } | { ok: false; error: string } {
  if (!enforce) return { ok: true }
  for (const name of [script, COMMON_SCRIPT]) {
    const expected = hashes[name]
    if (expected === undefined) return { ok: false, error: `${name} has no recorded checksum` }
    let actual: string
    try {
      actual = sha256File(join(dir, name))
    } catch {
      return { ok: false, error: `${name} is missing` }
    }
    if (actual.toLowerCase() !== expected.toLowerCase()) return { ok: false, error: `${name} was modified after installation; reinstall Redline` }
  }
  return { ok: true }
}
