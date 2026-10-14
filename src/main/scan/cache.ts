// Scan cache persisted to dataFile('scanCache') so the dashboard can show the last
// scan instantly after a restart.
import { z } from 'zod'
import type { SystemInfo } from '@shared/types'
import { dataFile } from '../paths'
import { readJsonFile, writeJsonFileAtomic } from '../store/jsonFile'
import { SystemInfoSchema } from './systemInfo'

export const SCAN_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000

const CacheFileSchema = z.object({ version: z.literal(1), info: SystemInfoSchema.nullable() })

/** Pure: is a scan taken at `scannedAt` still fresh at `now`? */
export function isFresh(scannedAt: string, maxAgeMs: number, now: number = Date.now()): boolean {
  const at = Date.parse(scannedAt)
  return Number.isFinite(at) && now - at >= 0 && now - at < maxAgeMs
}

/** The cached scan when it is younger than maxAgeMs, else null. */
export async function readCachedScan(maxAgeMs: number = SCAN_CACHE_MAX_AGE_MS): Promise<SystemInfo | null> {
  const { info } = await readJsonFile(dataFile('scanCache'), CacheFileSchema, { version: 1, info: null })
  return info !== null && isFresh(info.scannedAt, maxAgeMs) ? info : null
}

export async function writeCachedScan(info: SystemInfo): Promise<void> {
  await writeJsonFileAtomic(dataFile('scanCache'), { version: 1, info })
}
