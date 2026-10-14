// Shared catalog contract. Types only: no runtime dependencies.
// The bundled catalog (src/main/catalog/catalog.json) is validated against a zod
// mirror of these types in src/main/catalog/schema.ts.

export type Category =
  | 'power'
  | 'scheduling'
  | 'gpu'
  | 'gaming'
  | 'input'
  | 'visual'
  | 'network'
  | 'storage'
  | 'privacy'
  | 'services'
  | 'debloat'

export type Risk = 'safe' | 'moderate' | 'advanced'
export type Impact = 'high' | 'medium' | 'low'

export type RegValueType =
  | 'REG_DWORD'
  | 'REG_SZ'
  | 'REG_EXPAND_SZ'
  | 'REG_QWORD'
  | 'REG_BINARY'
  | 'REG_MULTI_SZ'

/**
 * REG_DWORD / REG_QWORD -> number, REG_SZ / REG_EXPAND_SZ -> string,
 * REG_BINARY -> lowercase hex string without separators (e.g. "9032078010000000"),
 * REG_MULTI_SZ -> string[].
 */
export type RegValue = number | string | string[]

export interface RegistryAction {
  type: 'registry'
  hive: 'HKLM' | 'HKCU'
  path: string
  name: string
  valueType: RegValueType
  value: RegValue
  /** Windows default. null = the value does not exist by default (revert deletes it). */
  default: RegValue | null
}

export type ServiceStart = 'Disabled' | 'Manual' | 'Automatic' | 'AutomaticDelayed'

export interface ServiceAction {
  type: 'service'
  name: string
  startType: ServiceStart
  default: ServiceStart
}

export interface TaskAction {
  type: 'scheduledTask'
  /** Full task path including the task name, e.g. "\\Microsoft\\Windows\\Maps\\MapsUpdateTask". */
  path: string
  enabled: boolean
  defaultEnabled: boolean
}

export interface PowercfgAction {
  type: 'powercfg'
  subgroup: string
  setting: string
  ac: number
  dc: number | null
  defaultAc: number
  defaultDc: number | null
  hidden: boolean
}

export interface PowerSchemeAction {
  type: 'powerScheme'
  scheme: 'ultimate'
}

export interface CommandAction {
  type: 'command'
  apply: string
  revert: string
  /** PowerShell expression that evaluates to $true when the tweak is in effect. */
  detect: string
}

export type TweakAction =
  | RegistryAction
  | ServiceAction
  | TaskAction
  | PowercfgAction
  | PowerSchemeAction
  | CommandAction

export type TweakActionType = TweakAction['type']

export interface Tweak {
  id: string
  title: string
  description: string
  category: Category
  risk: Risk
  impact: Impact
  impactNote: string
  recommended: boolean
  recommendReason: string
  sideEffects: string
  requiresReboot: boolean
  sources: string[]
  actions: TweakAction[]
}

export interface AppxEntry {
  package: string
  title: string
  recommended: boolean
  note: string
}

/**
 * CONTRACT CHANGE (scaffold): the research data carries a title and a reason for
 * every protected package, so neverRemove is an object list instead of string[].
 */
export interface NeverRemoveEntry {
  package: string
  title: string
  reason: string
}

export interface ExcludedEntry {
  name: string
  reason: string
}

export interface Catalog {
  version: number
  generatedFor: string
  tweaks: Tweak[]
  appx: AppxEntry[]
  neverRemove: NeverRemoveEntry[]
  excluded: ExcludedEntry[]
}

export const CATEGORIES: readonly Category[] = [
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
] as const

export const RISKS: readonly Risk[] = ['safe', 'moderate', 'advanced'] as const
export const IMPACTS: readonly Impact[] = ['high', 'medium', 'low'] as const
