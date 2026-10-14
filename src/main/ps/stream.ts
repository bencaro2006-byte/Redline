// Streaming runner for long-running allowlisted scripts (Watch-Metrics.ps1).
// Same spawn rules as runner.ts, but every stdout line is one JSON value that is
// validated and emitted. Runs outside the one-at-a-time queue. stop() kills the tree.
import type { ChildProcess } from 'node:child_process'
import type { z } from 'zod'
import { createLogger } from '../log'
import { LineSplitter, ScriptErrorBody, toAsciiJson, tryParseJson } from './protocol'
import { killTree, SCRIPTS, ScriptError, spawnPowerShell, type StreamScriptId } from './runner'

const log = createLogger('ps-stream')
const MAX_LINE_CHARS = 64_000
const MAX_BAD_LINES_LOGGED = 5

export interface StreamExit {
  code: number | null
  /** true when stop() ended the process. */
  stopped: boolean
  stderr: string
}

export interface StreamHandlers<T> {
  onData(value: T): void
  /** A script-reported { ok:false, error } line or a runner failure. The stream may keep running. */
  onError?(error: ScriptError): void
  onExit?(exit: StreamExit): void
}

export interface StreamHandle {
  stop(): void
  isRunning(): boolean
}

export function startStream<S extends z.ZodType>(
  id: StreamScriptId,
  input: unknown,
  lineSchema: S,
  handlers: StreamHandlers<z.infer<S>>,
): StreamHandle {
  let child: ChildProcess
  try {
    child = spawnPowerShell(id)
  } catch (err) {
    const error = err instanceof ScriptError ? err : new ScriptError(id, 'SPAWN_FAILED', String(err))
    handlers.onError?.(error)
    handlers.onExit?.({ code: null, stopped: false, stderr: '' })
    return { stop: () => undefined, isRunning: () => false }
  }

  const splitter = new LineSplitter(MAX_LINE_CHARS)
  const stderrChunks: string[] = []
  let running = true
  let stopped = false
  let badLines = 0

  const handleLine = (line: string): void => {
    const parsed = tryParseJson(line)
    if (parsed.ok) {
      const value = lineSchema.safeParse(parsed.value)
      if (value.success) {
        handlers.onData(value.data)
        return
      }
      const failure = ScriptErrorBody.safeParse((parsed.value as { error?: unknown } | null)?.error)
      if (failure.success) {
        handlers.onError?.(new ScriptError(id, failure.data.code, failure.data.message))
        return
      }
    }
    badLines += 1
    if (badLines <= MAX_BAD_LINES_LOGGED) log.warn(`${SCRIPTS[id]}: ignoring invalid line`, line.slice(0, 300))
  }

  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    try {
      splitter.push(chunk).forEach(handleLine)
    } catch (err) {
      log.error(`${SCRIPTS[id]}: stream protocol violation`, err)
      handlers.onError?.(new ScriptError(id, 'BAD_OUTPUT', String(err)))
      killTree(child)
    }
  })
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    if (stderrChunks.length < 200) stderrChunks.push(chunk)
  })
  child.on('error', (err) => handlers.onError?.(new ScriptError(id, 'SPAWN_FAILED', err.message)))
  child.on('close', (code) => {
    running = false
    splitter.flush().forEach(handleLine)
    const stderr = stderrChunks.join('').trim().slice(0, 4000)
    if (!stopped) log.warn(`${SCRIPTS[id]} exited (code ${code})`, stderr)
    handlers.onExit?.({ code, stopped, stderr })
  })
  child.stdin?.on('error', () => {
    // EPIPE if the script exits early; reported via 'close'.
  })
  child.stdin?.end(toAsciiJson(input))

  return {
    stop: () => {
      if (!running || stopped) return
      stopped = true
      killTree(child)
    },
    isRunning: () => running,
  }
}
