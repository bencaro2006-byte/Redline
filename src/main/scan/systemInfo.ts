// readSystemInfo(): runs Get-SystemInfo.ps1 (read-only) and validates its output.
import { z } from 'zod'
import type { SystemInfo } from '@shared/types'
import { runScript } from '../ps/runner'

const count = z.number().int().nonnegative()
const bytes = z.number().nonnegative()

export const SystemInfoSchema: z.ZodType<SystemInfo> = z.object({
  scannedAt: z.string(),
  computerName: z.string(),
  cpu: z.object({ name: z.string(), cores: count, threads: count, baseMHz: count, vendor: z.string() }),
  gpus: z.array(z.object({ name: z.string(), driverVersion: z.string(), nvidiaDriver: z.string().nullable(), vramBytes: bytes.nullable() })),
  memory: z.object({
    totalBytes: bytes,
    modules: z.array(
      z.object({
        capacityBytes: bytes,
        speedMTs: count,
        configuredMTs: count,
        manufacturer: z.string(),
        partNumber: z.string(),
        slot: z.string(),
      }),
    ),
  }),
  disks: z.array(z.object({ model: z.string(), mediaType: z.string(), busType: z.string(), sizeBytes: bytes, isSystem: z.boolean() })),
  volumes: z.array(z.object({ letter: z.string(), sizeBytes: bytes, freeBytes: bytes })),
  board: z.object({ manufacturer: z.string(), product: z.string() }),
  bios: z.object({ version: z.string(), releaseDate: z.string().nullable() }),
  os: z.object({ caption: z.string(), version: z.string(), build: z.string(), displayVersion: z.string().nullable() }),
  displays: z.array(z.object({ name: z.string(), width: count, height: count, refreshHz: count })),
  power: z.object({ activeSchemeGuid: z.string(), activeSchemeName: z.string() }),
  security: z.object({ defenderRealtime: z.boolean().nullable(), vbsRunning: z.boolean().nullable() }),
  gaming: z.object({
    gameModeOn: z.boolean().nullable(),
    gameDvrOn: z.boolean().nullable(),
    hagsOn: z.boolean().nullable(),
    trimEnabled: z.boolean().nullable(),
  }),
})

export async function readSystemInfo(): Promise<SystemInfo> {
  return runScript('systemInfo', {}, SystemInfoSchema)
}
