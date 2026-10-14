// scanSystem(): cached unless forced, else Get-SystemInfo.ps1 + health checks.
// invalidateScan() is called after changes so the next scan reflects them.
import type { ScanResult } from '@shared/api'
import type { SystemInfo } from '@shared/types'
import { getCatalog } from '../catalog'
import { createLogger } from '../log'
import { dataFile } from '../paths'
import { writeJsonFileAtomic } from '../store/jsonFile'
import { readCachedScan, writeCachedScan } from './cache'
import { buildHealthChecks } from './health'
import { readSystemInfo } from './systemInfo'

const log = createLogger('scan')

let memo: SystemInfo | null = null
let inFlight: Promise<SystemInfo> | null = null

function knownTweakIds(): Set<string> {
  return new Set(getCatalog().tweaks.map((t) => t.id))
}

async function freshScan(): Promise<SystemInfo> {
  inFlight ??= readSystemInfo()
    .then(async (info) => {
      memo = info
      await writeCachedScan(info).catch((err: unknown) => log.warn('could not write scan cache', err))
      return info
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

async function cachedScan(): Promise<SystemInfo | null> {
  if (memo !== null) return memo
  try {
    memo = await readCachedScan()
  } catch (err) {
    log.warn('could not read scan cache', err)
  }
  return memo
}

export async function scanSystem(force: boolean): Promise<ScanResult> {
  const info = (!force ? await cachedScan() : null) ?? (await freshScan())
  return { info, health: buildHealthChecks(info, knownTweakIds()) }
}

/** Drops the in-memory and on-disk scan so the next scanSystem() reads the PC again. */
export async function invalidateScan(): Promise<void> {
  memo = null
  await writeJsonFileAtomic(dataFile('scanCache'), { version: 1, info: null }).catch((err: unknown) => log.warn('could not clear scan cache', err))
}

export { buildHealthChecks } from './health'
export { readSystemInfo } from './systemInfo'
