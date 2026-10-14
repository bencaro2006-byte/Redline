// Typed errors that IPC handlers map to Result error codes.
import type { ErrorCode } from '@shared/api'
import { ScriptError } from '../ps/runner'

export class IpcError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'IpcError'
  }
}

export interface ErrorBody {
  code: string
  message: string
}

/** Maps any thrown value to a Result error body. Script codes (e.g. TIMEOUT) pass through. */
export function toErrorBody(err: unknown): ErrorBody {
  if (err instanceof IpcError) return { code: err.code, message: err.message }
  if (err instanceof ScriptError) return { code: err.code, message: err.message }
  if (err instanceof Error) {
    if (err.message === 'not implemented') return { code: 'NOT_IMPLEMENTED', message: 'This feature is not implemented yet.' }
    return { code: 'FAILED', message: err.message }
  }
  return { code: 'FAILED', message: String(err) }
}
