// ipcMain.handle wrapper (spec §5): trusted-sender check, zod validation, Result<T>
// envelope. Handlers never reject: a rejection reaches the renderer as a flattened string.
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type { InvokeChannel, Result } from '@shared/api'
import { createLogger } from '../log'
import { isAppUrl } from '../security'
import { getMainWindow } from '../window'
import { toErrorBody } from './errors'

const log = createLogger('ipc')

export function fail(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message } }
}

/** Only the main window's top frame, showing the app's own page, may call IPC. */
export function isTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const win = getMainWindow()
  const frame = event.senderFrame
  return win !== null && event.sender === win.webContents && frame !== null && frame.parent === null && isAppUrl(frame.url)
}

export function handle<S extends z.ZodType, R>(channel: InvokeChannel, schema: S, fn: (req: z.infer<S>) => Promise<R>): void {
  ipcMain.handle(channel, async (event, raw: unknown): Promise<Result<R>> => {
    if (!isTrustedSender(event)) {
      log.warn(`rejected ${channel} from untrusted sender`)
      return fail('FORBIDDEN', 'Untrusted sender')
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return fail('INVALID_INPUT', z.prettifyError(parsed.error))
    try {
      return { ok: true, data: await fn(parsed.data) }
    } catch (err) {
      const body = toErrorBody(err)
      if (body.code === 'NOT_IMPLEMENTED') log.warn(`${channel}: not implemented`)
      else log.error(`${channel} failed`, err)
      return { ok: false, error: body }
    }
  })
}
