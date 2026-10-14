// Target identity (pure): which setting an action points at, ignoring the value it writes.
// Journal items are matched to catalog actions by key ("tweak#index"). A later catalog
// version could insert or reorder actions, so a journaled snapshot is only used when its
// recorded action still points at the same setting as the catalog action with that key.
import { commandKey } from '../catalog'
import type { TweakAction } from '@shared/catalog'

const lower = (value: string): string => value.toLowerCase()

export function targetId(action: TweakAction): string {
  switch (action.type) {
    case 'registry':
      return `registry:${action.hive}\\${lower(action.path)}\\${lower(action.name)}`
    case 'service':
      return `service:${lower(action.name)}`
    case 'scheduledTask':
      return `task:${lower(action.path)}`
    case 'powercfg':
      return `powercfg:${lower(action.subgroup)}/${lower(action.setting)}`
    case 'powerScheme':
      return `powerScheme:${action.scheme}`
    case 'command':
      return `command:${commandKey(action)}`
  }
}

export function sameTarget(a: TweakAction, b: TweakAction): boolean {
  return a.type === b.type && targetId(a) === targetId(b)
}
