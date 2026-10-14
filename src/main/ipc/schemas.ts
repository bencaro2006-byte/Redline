// zod schemas for every IPC request. Tweak ids are checked against the catalog and
// appx packages against the catalog appx list (never neverRemove).
import { z } from 'zod'
import { isKnownTweakId, isNeverRemove, isRemovableAppx } from '../catalog'

export const MAX_IDS_PER_REQUEST = 200
export const MAX_PACKAGES_PER_REQUEST = 100
export const ENTITY_ID = /^[A-Za-z0-9_-]{1,64}$/

/** Channels without a request argument (ipcRenderer.invoke(channel) sends undefined). */
export const NoArgs = z.undefined()

const uniqueStrings = (values: readonly string[]): boolean => new Set(values.map((v) => v.toLowerCase())).size === values.length

export const ScanReq = z.strictObject({ force: z.boolean() })

export const ApplyTweaksReq = z.strictObject({
  ids: z
    .array(z.string().min(1).max(80))
    .min(1)
    .max(MAX_IDS_PER_REQUEST)
    .refine(uniqueStrings, 'Duplicate tweak ids')
    .superRefine((ids, ctx) => {
      ids.forEach((id, i) => {
        if (!isKnownTweakId(id)) ctx.addIssue({ code: 'custom', path: [i], message: `Unknown tweak id: ${id}` })
      })
    }),
  mode: z.enum(['apply', 'revert']),
})

export const RevertBackupReq = z.strictObject({ backupId: z.string().regex(ENTITY_ID) })

export const RemoveAppxReq = z.strictObject({
  packages: z
    .array(z.string().min(3).max(128))
    .min(1)
    .max(MAX_PACKAGES_PER_REQUEST)
    .refine(uniqueStrings, 'Duplicate packages')
    .superRefine((packages, ctx) => {
      packages.forEach((pkg, i) => {
        if (isNeverRemove(pkg)) ctx.addIssue({ code: 'custom', path: [i], message: `Protected package: ${pkg}` })
        else if (!isRemovableAppx(pkg)) ctx.addIssue({ code: 'custom', path: [i], message: `Not in the removable app list: ${pkg}` })
      })
    }),
})

export const UpdateGameReq = z.strictObject({
  id: z.string().regex(ENTITY_ID),
  gpuHighPerformance: z.boolean(),
  disableFullscreenOptimizations: z.boolean(),
  highCpuPriority: z.boolean(),
})

export const RemoveGameReq = z.strictObject({ id: z.string().regex(ENTITY_ID) })

export const SettingsPatch = z
  .strictObject({
    dryRun: z.boolean().optional(),
    restorePointBeforeApply: z.boolean().optional(),
    closeToTray: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'Empty settings patch')
