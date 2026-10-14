// Tiny logger for the main process. No electron import so modules that log stay
// importable from vitest. index.ts calls initLog(app.getPath('logs')) at startup;
// before that (and in tests) lines only go to stderr.
import { appendFile, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const MAX_LOG_BYTES = 2_000_000
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

let logFile: string | null = null
let minLevel: LogLevel = 'info'

export function initLog(dir: string, level: LogLevel = 'info'): void {
  minLevel = level
  try {
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'main.log')
    rotateIfLarge(file)
    logFile = file
  } catch (err) {
    process.stderr.write(`[log] cannot open log dir ${dir}: ${describe(err)}\n`)
    logFile = null
  }
}

function rotateIfLarge(file: string): void {
  try {
    if (statSync(file).size > MAX_LOG_BYTES) renameSync(file, `${file}.old`)
  } catch {
    // File does not exist yet: nothing to rotate.
  }
}

export function describe(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function write(level: LogLevel, scope: string, parts: readonly unknown[]): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${parts.map(describe).join(' ')}\n`
  process.stderr.write(line)
  if (logFile === null) return
  appendFile(logFile, line, (err) => {
    if (err) process.stderr.write(`[log] write failed: ${err.message}\n`)
  })
}

export interface Logger {
  debug(...parts: unknown[]): void
  info(...parts: unknown[]): void
  warn(...parts: unknown[]): void
  error(...parts: unknown[]): void
}

export function createLogger(scope: string): Logger {
  return {
    debug: (...parts) => write('debug', scope, parts),
    info: (...parts) => write('info', scope, parts),
    warn: (...parts) => write('warn', scope, parts),
    error: (...parts) => write('error', scope, parts),
  }
}

export const log = createLogger('main')
