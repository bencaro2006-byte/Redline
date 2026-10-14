// zod schemas for engine data crossing a trust boundary: PowerShell output and the
// backup journal on disk. Pure (no electron) so they are unit-testable.
import { z } from 'zod'
import type { Snapshot } from '@shared/types'
import { RegValueSchema, RegValueTypeSchema, ServiceStartSchema, TweakActionSchema } from '../catalog/schema'

const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export const SnapshotSchema: z.ZodType<Snapshot> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('registry'),
    exists: z.boolean(),
    valueType: RegValueTypeSchema.nullable(),
    value: RegValueSchema.nullable(),
  }),
  z.object({ kind: z.literal('service'), exists: z.boolean(), startType: ServiceStartSchema.nullable() }),
  z.object({ kind: z.literal('scheduledTask'), exists: z.boolean(), enabled: z.boolean().nullable() }),
  z.object({
    kind: z.literal('powercfg'),
    exists: z.boolean(),
    ac: z.number().int().nullable(),
    dc: z.number().int().nullable(),
    schemeGuid: z.union([z.string().regex(GUID), z.literal('SCHEME_CURRENT')]),
  }),
  z.object({
    kind: z.literal('powerScheme'),
    activeGuid: z.string().regex(GUID),
    activeName: z.string().max(512),
    isUltimate: z.boolean(),
    createdGuid: z.string().regex(GUID).nullable().optional(),
  }),
  z.object({ kind: z.literal('command'), detected: z.boolean().nullable() }),
])

const ItemKey = z.string().min(1).max(200)
/** Script error text is shown to the user; long messages are cut instead of failing the whole result. */
const ErrorText = z.string().transform((s) => (s.length > 2000 ? `${s.slice(0, 2000)}…` : s))

/** Get-TweakState.ps1 data. Each result has a snapshot or an error. */
export const ProbeDataSchema = z.object({
  results: z.array(
    z.object({
      key: ItemKey,
      snapshot: SnapshotSchema.optional(),
      error: ErrorText.optional(),
    }),
  ),
})

/** Invoke-Tweaks.ps1 data. */
export const InvokeDataSchema = z.object({
  results: z.array(
    z.object({
      key: ItemKey,
      ok: z.boolean(),
      changed: z.boolean(),
      error: ErrorText.optional(),
      createdGuid: z.string().regex(GUID).nullable().optional(),
    }),
  ),
})

/** New-RestorePoint.ps1 data. */
export const RestorePointDataSchema = z.object({
  created: z.boolean(),
  skippedRecent: z.boolean(),
  latestCreatedAt: z.string().nullable(),
  warning: z.string(),
})

const BACKUP_ID = /^[A-Za-z0-9_-]{1,64}$/

export const BackupEntrySchema = z.object({
  id: z.string().regex(BACKUP_ID),
  createdAt: z.string(),
  tweakIds: z.array(z.string()),
  kind: z.enum(['tweaks', 'game']),
  label: z.string().max(200),
  items: z.array(z.object({ key: ItemKey, action: TweakActionSchema, before: SnapshotSchema })),
  revertedAt: z.string().nullable(),
})

export const BackupFileSchema = z.object({
  version: z.literal(1),
  entries: z.array(BackupEntrySchema),
})

export type BackupFile = z.infer<typeof BackupFileSchema>
