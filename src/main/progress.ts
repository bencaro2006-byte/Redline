// Task progress events (main -> renderer). Modules call emitProgress(); the event
// goes to the main window only.
import { IPC_EVENTS, type TaskProgress } from '@shared/api'
import { getMainWindow } from './window'

export type ProgressReporter = (progress: TaskProgress) => void

export const emitProgress: ProgressReporter = (progress) => {
  const win = getMainWindow()
  if (win === null || win.webContents.isDestroyed()) return
  win.webContents.send(IPC_EVENTS.taskProgress, progress)
}

/** Reporter bound to one task name: report(done, total, message). */
export function progressFor(task: string, reporter: ProgressReporter = emitProgress) {
  return (done: number, total: number, message: string): void => reporter({ task, message, done, total })
}
