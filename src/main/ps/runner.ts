// PowerShell runner (spec §6). Windows PowerShell 5.1 by absolute path, arg array,
// -File only, JSON on stdin (ASCII-escaped), one JSON line on stdout, hard-coded
// script allowlist, one script at a time, taskkill tree on timeout.
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import type { z } from 'zod'
import { createLogger } from '../log'
import { scriptsDir } from '../paths'
import { hardenedEnv, safeSystemRoot } from './env'
import { verifyScriptIntegrity } from './integrity'
import { lastJsonLine, ScriptEnvelope, toAsciiJson, tryParseJson } from './protocol'

const log = createLogger('ps')

const SYSTEM_ROOT = safeSystemRoot()
export const POWERSHELL = join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const TASKKILL = join(SYSTEM_ROOT, 'System32', 'taskkill.exe')
const MAX_STDOUT_BYTES = 4_000_000
const MAX_STDERR_BYTES = 200_000

/** The only scripts main may run. The renderer never sends paths, script text or raw arguments. */
export const SCRIPTS = {
  systemInfo: 'Get-SystemInfo.ps1',
  tweakState: 'Get-TweakState.ps1',
  invokeTweaks: 'Invoke-Tweaks.ps1',
  restorePoint: 'New-RestorePoint.ps1',
  getAppx: 'Get-Appx.ps1',
  removeAppx: 'Remove-Appx.ps1',
  watchMetrics: 'Watch-Metrics.ps1',
} as const

export type ScriptId = keyof typeof SCRIPTS
export type StreamScriptId = 'watchMetrics'
export type OneShotScriptId = Exclude<ScriptId, StreamScriptId>

export const DEFAULT_TIMEOUT_MS: Readonly<Record<OneShotScriptId, number>> = {
  systemInfo: 120_000,
  tweakState: 180_000,
  invokeTweaks: 600_000,
  restorePoint: 900_000, // VSS snapshot can take minutes (spec §8)
  getAppx: 120_000,
  removeAppx: 900_000,
}

export const POWERSHELL_BASE_ARGS: readonly string[] = [
  '-NoLogo',
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
]

/** A failure reported by a script ({ ok:false, error }) or by the runner itself. */
export class ScriptError extends Error {
  constructor(
    readonly scriptId: ScriptId,
    readonly code: string,
    message: string,
  ) {
    super(`${SCRIPTS[scriptId]}: ${message}`)
    this.name = 'ScriptError'
  }
}

export function scriptPath(id: ScriptId): string {
  return join(scriptsDir(), SCRIPTS[id])
}

export function spawnPowerShell(id: ScriptId): ChildProcess {
  if (process.platform !== 'win32') throw new ScriptError(id, 'UNSUPPORTED_PLATFORM', 'Windows only')
  const integrity = verifyScriptIntegrity(scriptsDir(), SCRIPTS[id])
  if (!integrity.ok) throw new ScriptError(id, 'INTEGRITY', integrity.error)
  // Hardened env: no user module paths, profilers or planted PATH entries in the elevated child.
  return spawn(POWERSHELL, [...POWERSHELL_BASE_ARGS, scriptPath(id)], {
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: hardenedEnv(),
  })
}

/** taskkill /T /F: child.kill() would only end powershell.exe, not what it started (spec §6 rule 6). */
export function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return
  const killer = spawn(TASKKILL, ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore', env: hardenedEnv() })
  killer.on('error', (err) => {
    log.error(`taskkill failed for pid ${child.pid}`, err)
    child.kill()
  })
}

// One script at a time (spec §6 rule 7). Streams (Watch-Metrics) run outside this queue.
let queueTail: Promise<unknown> = Promise.resolve()

export interface RunOptions {
  timeoutMs?: number
}

/**
 * Runs an allowlisted script with `input` as JSON on stdin and resolves with the
 * validated `data` of its envelope. Rejects with ScriptError on any failure.
 */
export function runScript<S extends z.ZodType>(
  id: OneShotScriptId,
  input: unknown,
  dataSchema: S,
  options: RunOptions = {},
): Promise<z.infer<S>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS[id]
  const run = (): Promise<z.infer<S>> => runNow(id, input, dataSchema, timeoutMs)
  const result = queueTail.then(run, run)
  queueTail = result.catch(() => undefined)
  return result
}

function runNow<S extends z.ZodType>(id: OneShotScriptId, input: unknown, dataSchema: S, timeoutMs: number): Promise<z.infer<S>> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    let child: ChildProcess
    try {
      child = spawnPowerShell(id)
    } catch (err) {
      reject(err instanceof ScriptError ? err : new ScriptError(id, 'SPAWN_FAILED', errorMessage(err)))
      return
    }
    const out: Buffer[] = []
    const err: Buffer[] = []
    let outBytes = 0
    let errBytes = 0
    let settled = false

    const finish = (error: ScriptError | null, value?: z.infer<S>): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      log.debug(`${SCRIPTS[id]} finished in ${Date.now() - startedAt} ms${error ? ` (${error.code})` : ''}`)
      if (error) reject(error)
      else resolve(value as z.infer<S>)
    }

    const timer = setTimeout(() => {
      killTree(child)
      finish(new ScriptError(id, 'TIMEOUT', `timed out after ${timeoutMs} ms`))
    }, timeoutMs)

    child.stdout?.on('data', (b: Buffer) => {
      outBytes += b.length
      if (outBytes > MAX_STDOUT_BYTES) {
        killTree(child)
        finish(new ScriptError(id, 'OUTPUT_TOO_LARGE', 'output too large'))
        return
      }
      out.push(b)
    })
    child.stderr?.on('data', (b: Buffer) => {
      errBytes += b.length
      if (errBytes <= MAX_STDERR_BYTES) err.push(b)
    })
    child.on('error', (e) => finish(new ScriptError(id, 'SPAWN_FAILED', e.message)))
    child.on('close', (code) => {
      const stderr = Buffer.concat(err).toString('utf8').trim()
      if (stderr.length > 0) log.debug(`${SCRIPTS[id]} stderr:`, stderr.slice(0, 4000))
      const parsedLine = tryParseJson(lastJsonLine(Buffer.concat(out).toString('utf8')))
      if (!parsedLine.ok) {
        finish(new ScriptError(id, 'NO_JSON', `exit ${code}, no JSON on stdout. ${stderr.slice(0, 2000)}`))
        return
      }
      const envelope = ScriptEnvelope.safeParse(parsedLine.value)
      if (!envelope.success) {
        finish(new ScriptError(id, 'BAD_OUTPUT', `no result envelope (exit ${code})`))
        return
      }
      if (!envelope.data.ok) {
        finish(new ScriptError(id, envelope.data.error.code, envelope.data.error.message))
        return
      }
      const data = dataSchema.safeParse(envelope.data.data)
      if (data.success) {
        finish(null, data.data)
        return
      }
      log.warn(`${SCRIPTS[id]} returned an unexpected data shape`, data.error.issues.slice(0, 5))
      finish(new ScriptError(id, 'BAD_OUTPUT', `unexpected output shape (exit ${code})`))
    })
    child.stdin?.on('error', () => {
      // EPIPE when the script exits before reading stdin; reported via 'close'.
    })
    child.stdin?.end(toAsciiJson(input))
  })
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
