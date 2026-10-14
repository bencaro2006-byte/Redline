// zod mirror of src/shared/catalog.ts. Validates the bundled catalog at startup and
// is reused by IPC/engine code that needs to validate TweakAction / Snapshot data.
import { z } from 'zod'
import type { Catalog, RegValue, RegValueType, TweakAction } from '@shared/catalog'

const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const TWEAK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const REG_PATH = /^[^\\/:*?"<>|][^:*?"<>|]*$/ // relative to the hive; no "HKLM:\" prefix, no leading backslash
const SERVICE_NAME = /^[A-Za-z0-9_.-]{1,256}$/
const TASK_PATH = /^\\[^/:*?"<>|]+$/ // full path incl. task name, starting with "\"
const PACKAGE_PATTERN = /^[A-Za-z0-9.*-]{3,128}$/ // AppX package family prefix; "*" allowed in neverRemove only

export const CategorySchema = z.enum([
  'power',
  'scheduling',
  'gpu',
  'gaming',
  'input',
  'visual',
  'network',
  'storage',
  'privacy',
  'services',
  'debloat',
])
export const RiskSchema = z.enum(['safe', 'moderate', 'advanced'])
export const ImpactSchema = z.enum(['high', 'medium', 'low'])
export const RegValueTypeSchema = z.enum(['REG_DWORD', 'REG_SZ', 'REG_EXPAND_SZ', 'REG_QWORD', 'REG_BINARY', 'REG_MULTI_SZ'])
// Bounded: the same schema validates the backup journal on disk.
export const RegValueSchema = z.union([z.number(), z.string().max(8192), z.array(z.string().max(1024)).max(64)])
export const ServiceStartSchema = z.enum(['Disabled', 'Manual', 'Automatic', 'AutomaticDelayed'])

/** true when `value` has the JS shape documented for `valueType` in shared/catalog.ts. */
export function regValueMatchesType(valueType: RegValueType, value: RegValue): boolean {
  switch (valueType) {
    case 'REG_DWORD':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff
    case 'REG_QWORD':
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    case 'REG_SZ':
    case 'REG_EXPAND_SZ':
      return typeof value === 'string'
    case 'REG_BINARY':
      return typeof value === 'string' && /^(?:[0-9a-fA-F]{2})*$/.test(value)
    case 'REG_MULTI_SZ':
      return Array.isArray(value)
  }
}

export const RegistryActionSchema = z
  .strictObject({
    type: z.literal('registry'),
    hive: z.enum(['HKLM', 'HKCU']),
    path: z.string().min(1).max(512).regex(REG_PATH),
    name: z.string().max(256),
    valueType: RegValueTypeSchema,
    value: RegValueSchema,
    default: RegValueSchema.nullable(),
  })
  .superRefine((a, ctx) => {
    if (!regValueMatchesType(a.valueType, a.value)) ctx.addIssue({ code: 'custom', path: ['value'], message: `value does not match ${a.valueType}` })
    if (a.default !== null && !regValueMatchesType(a.valueType, a.default))
      ctx.addIssue({ code: 'custom', path: ['default'], message: `default does not match ${a.valueType}` })
  })

export const ServiceActionSchema = z.strictObject({
  type: z.literal('service'),
  name: z.string().regex(SERVICE_NAME),
  startType: ServiceStartSchema,
  default: ServiceStartSchema,
})

export const TaskActionSchema = z.strictObject({
  type: z.literal('scheduledTask'),
  path: z.string().min(2).max(512).regex(TASK_PATH),
  enabled: z.boolean(),
  defaultEnabled: z.boolean(),
})

export const PowercfgActionSchema = z.strictObject({
  type: z.literal('powercfg'),
  subgroup: z.string().regex(GUID),
  setting: z.string().regex(GUID),
  ac: z.number().int().nonnegative(),
  dc: z.number().int().nonnegative().nullable(),
  defaultAc: z.number().int().nonnegative(),
  defaultDc: z.number().int().nonnegative().nullable(),
  hidden: z.boolean(),
})

export const PowerSchemeActionSchema = z.strictObject({
  type: z.literal('powerScheme'),
  scheme: z.literal('ultimate'),
})

export const CommandActionSchema = z.strictObject({
  type: z.literal('command'),
  apply: z.string().min(1).max(4000),
  revert: z.string().min(1).max(4000),
  detect: z.string().min(1).max(4000),
})

export const TweakActionSchema: z.ZodType<TweakAction> = z.discriminatedUnion('type', [
  RegistryActionSchema,
  ServiceActionSchema,
  TaskActionSchema,
  PowercfgActionSchema,
  PowerSchemeActionSchema,
  CommandActionSchema,
])

export const TweakSchema = z.strictObject({
  id: z.string().min(2).max(80).regex(TWEAK_ID),
  title: z.string().min(1).max(120),
  description: z.string().min(1),
  category: CategorySchema,
  risk: RiskSchema,
  impact: ImpactSchema,
  impactNote: z.string(),
  recommended: z.boolean(),
  recommendReason: z.string(),
  sideEffects: z.string(),
  requiresReboot: z.boolean(),
  sources: z.array(z.url({ protocol: /^https$/ })),
  actions: z.array(TweakActionSchema).min(1),
})

export const AppxEntrySchema = z.strictObject({
  package: z.string().regex(PACKAGE_PATTERN).refine((p) => !p.includes('*'), 'wildcards are not allowed in appx'),
  title: z.string().min(1),
  recommended: z.boolean(),
  note: z.string(),
})

export const NeverRemoveEntrySchema = z.strictObject({
  package: z.string().regex(PACKAGE_PATTERN),
  title: z.string().min(1),
  reason: z.string().min(1),
})

export const ExcludedEntrySchema = z.strictObject({
  name: z.string().min(1),
  reason: z.string().min(1),
})

export const CatalogSchema: z.ZodType<Catalog> = z
  .strictObject({
    version: z.number().int().positive(),
    generatedFor: z.string().min(1),
    tweaks: z.array(TweakSchema).min(1),
    appx: z.array(AppxEntrySchema),
    neverRemove: z.array(NeverRemoveEntrySchema),
    excluded: z.array(ExcludedEntrySchema),
  })
  .superRefine((c, ctx) => {
    const seen = new Set<string>()
    c.tweaks.forEach((t, i) => {
      if (seen.has(t.id)) ctx.addIssue({ code: 'custom', path: ['tweaks', i, 'id'], message: `duplicate tweak id ${t.id}` })
      seen.add(t.id)
    })
    c.appx.forEach((a, i) => {
      if (matchesAnyPackagePattern(a.package, c.neverRemove.map((n) => n.package)))
        ctx.addIssue({ code: 'custom', path: ['appx', i, 'package'], message: `${a.package} is in neverRemove` })
    })
  })

/** Case-insensitive match against package patterns where "*" matches any run of characters. */
export function matchesAnyPackagePattern(pkg: string, patterns: readonly string[]): boolean {
  const name = pkg.toLowerCase()
  return patterns.some((pattern) => {
    const re = new RegExp(`^${pattern.toLowerCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
    return re.test(name)
  })
}
