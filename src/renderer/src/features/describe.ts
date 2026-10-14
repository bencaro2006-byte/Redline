// Plain-language descriptions of catalog actions for the confirm dialog and the detail
// drawer (pure, unit-tested). Shows exactly what will change, never hides it.
import type { RegValue, TweakAction } from '@shared/catalog'
import type { Snapshot } from '@shared/types'

const POWER_SETTING_NAMES: Readonly<Record<string, string>> = {
  '893dee8e-2bef-41e0-89c6-b55d0929964c': 'Minimum processor state',
  '48e6b7a6-50f5-4782-a5d4-53bb8f07e226': 'USB selective suspend',
  'ee12f906-d277-404b-b6da-e5fa1a576df5': 'PCI Express link state power management',
  '0b2d69d7-a2a1-449c-9680-f91c70521c60': 'SATA link power management',
  'be337238-0d82-4146-a960-4f3749d470c7': 'Processor performance boost mode',
  '0cc5b647-c1df-4637-891a-dec35c318583': 'Processor core parking minimum cores',
}

const START_TYPE_LABEL: Readonly<Record<string, string>> = {
  Disabled: 'Disabled',
  Manual: 'Manual',
  Automatic: 'Automatic',
  AutomaticDelayed: 'Automatic (delayed start)',
}

export function formatRegValue(value: RegValue | null): string {
  if (value === null) return '(not set)'
  if (Array.isArray(value)) return value.map((v) => `"${v}"`).join(', ')
  if (typeof value === 'number') return value > 0xffff ? `${value} (0x${value.toString(16).toUpperCase()})` : String(value)
  return `"${value}"`
}

export function registryPath(action: Extract<TweakAction, { type: 'registry' }>): string {
  return `${action.hive}\\${action.path}`
}

/** One line describing what applying the action does. */
export function describeApply(action: TweakAction): string {
  switch (action.type) {
    case 'registry':
      return `Set ${action.name === '' ? '(Default)' : action.name} = ${formatRegValue(action.value)} in ${registryPath(action)}`
    case 'service':
      return `Set the ${action.name} service to ${START_TYPE_LABEL[action.startType] ?? action.startType}`
    case 'scheduledTask':
      return `${action.enabled ? 'Enable' : 'Disable'} the scheduled task ${action.path}`
    case 'powercfg': {
      const name = POWER_SETTING_NAMES[action.setting.toLowerCase()] ?? `Power setting ${action.setting}`
      return `${name}: ${action.ac} when plugged in${action.dc !== null ? `, ${action.dc} on battery` : ''} (active power plan)`
    }
    case 'powerScheme':
      return 'Switch to the Ultimate Performance power plan (an existing copy is reused, otherwise one is created)'
    case 'command':
      return `Run: ${action.apply}`
  }
}

/** One line describing what reverting the action does when no backup exists (Windows default). */
export function describeDefault(action: TweakAction): string {
  switch (action.type) {
    case 'registry':
      return action.default === null
        ? `Remove ${action.name === '' ? '(Default)' : action.name} from ${registryPath(action)}`
        : `Set ${action.name} back to ${formatRegValue(action.default)} in ${registryPath(action)}`
    case 'service':
      return `Set the ${action.name} service back to ${START_TYPE_LABEL[action.default] ?? action.default}`
    case 'scheduledTask':
      return `${action.defaultEnabled ? 'Enable' : 'Disable'} the scheduled task ${action.path}`
    case 'powercfg': {
      const name = POWER_SETTING_NAMES[action.setting.toLowerCase()] ?? `Power setting ${action.setting}`
      return `${name}: back to ${action.defaultAc} when plugged in`
    }
    case 'powerScheme':
      return 'Switch back to the previous power plan (Balanced if unknown)'
    case 'command':
      return `Run: ${action.revert}`
  }
}

/** The saved "before" value of a backup item, for the Backups screen. */
export function describeSnapshot(snapshot: Snapshot): string {
  switch (snapshot.kind) {
    case 'registry':
      return snapshot.exists ? formatRegValue(snapshot.value) : '(not set)'
    case 'service':
      return snapshot.exists ? (START_TYPE_LABEL[snapshot.startType ?? ''] ?? String(snapshot.startType)) : '(not installed)'
    case 'scheduledTask':
      return !snapshot.exists ? '(not present)' : snapshot.enabled ? 'Enabled' : 'Disabled'
    case 'powercfg':
      return snapshot.exists ? `${snapshot.ac ?? '?'} plugged in${snapshot.dc !== null ? `, ${snapshot.dc} on battery` : ''}` : '(not present)'
    case 'powerScheme':
      return snapshot.activeName || snapshot.activeGuid
    case 'command':
      return snapshot.detected === null ? 'unknown' : snapshot.detected ? 'on' : 'off'
  }
}
