// One system-changing operation at a time (apply, revert, restore point, appx removal,
// game changes). A second request while one runs gets BUSY instead of queueing.
import { IpcError } from './errors'

let running: string | null = null

export function busyTask(): string | null {
  return running
}

export async function exclusive<T>(task: string, fn: () => Promise<T>): Promise<T> {
  if (running !== null) throw new IpcError('BUSY', `Another operation is still running (${running}).`)
  running = task
  try {
    return await fn()
  } finally {
    running = null
  }
}
