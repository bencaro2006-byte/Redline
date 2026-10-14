// App settings persisted to dataFile('settings') (atomic writes). Missing or invalid
// fields fall back to defaults. Dry-run defaults to ON in development builds and OFF
// in the packaged app.
import { app } from 'electron'
import { z } from 'zod'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import { dataFile } from '../paths'
import { readJsonFile, writeJsonFileAtomic } from '../store/jsonFile'

const StoredSettingsSchema = z.object({
  version: z.literal(1),
  settings: z
    .object({
      dryRun: z.boolean(),
      restorePointBeforeApply: z.boolean(),
      closeToTray: z.boolean(),
    })
    .partial(),
})

type StoredSettings = z.infer<typeof StoredSettingsSchema>

/** Defaults for this build (pure given `packaged`). */
export function defaultSettings(packaged: boolean): Settings {
  return { ...DEFAULT_SETTINGS, dryRun: !packaged }
}

/** Stored values over defaults (pure). */
export function mergeSettings(defaults: Settings, stored: Partial<Settings>, patch: Partial<Settings> = {}): Settings {
  const pick = <K extends keyof Settings>(key: K): Settings[K] => patch[key] ?? stored[key] ?? defaults[key]
  return { dryRun: pick('dryRun'), restorePointBeforeApply: pick('restorePointBeforeApply'), closeToTray: pick('closeToTray') }
}

async function readStored(): Promise<StoredSettings> {
  return readJsonFile(dataFile('settings'), StoredSettingsSchema, { version: 1, settings: {} })
}

export async function getSettings(): Promise<Settings> {
  return mergeSettings(defaultSettings(app.isPackaged), (await readStored()).settings)
}

/** Merges the patch, persists, returns the full new settings. */
export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = mergeSettings(defaultSettings(app.isPackaged), (await readStored()).settings, patch)
  await writeJsonFileAtomic(dataFile('settings'), { version: 1, settings: next })
  return next
}
