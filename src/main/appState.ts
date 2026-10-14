// In-memory mirror of the persisted settings for synchronous readers (tray close
// behaviour, dry-run gating in IPC). The settings module owns persistence; IPC
// refreshes this mirror after every successful getSettings/setSettings.
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'

let current: Readonly<Settings> = { ...DEFAULT_SETTINGS }

export function currentSettings(): Readonly<Settings> {
  return current
}

export function rememberSettings(next: Settings): Readonly<Settings> {
  current = Object.freeze({ ...next })
  return current
}
