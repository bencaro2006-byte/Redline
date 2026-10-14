// Never trust actions read from disk. The backup journal lives in the user's profile, so a
// non-elevated process could edit it; the elevated revert must only ever run actions that
// Redline itself defines. Tweak entries are re-resolved from the bundled catalog by key and
// must still point at the same setting (a later catalog version may reorder actions), and
// game entries must match the three registry shapes the Games feature writes.
import type { BackupEntry, BackupItem } from '@shared/types'
import { catalogActionForKey } from '../catalog'
import { isAllowedGameAction } from '../games/actions'
import { sameTarget } from './targets'
import type { InvokeItem } from './types'

export interface TrustedRestore {
  /** Restore items in the order to run them (reverse of how the entry was applied). */
  items: InvokeItem[]
  /** Journal items that were refused, with the reason. */
  rejected: { key: string; error: string }[]
}

function trustedAction(entry: BackupEntry, item: BackupItem): InvokeItem['action'] | string {
  if (entry.kind === 'game') return isAllowedGameAction(item.key, item.action) ? item.action : 'This backup item does not match a Redline game setting.'
  const action = catalogActionForKey(item.key)
  if (action === undefined) return 'This backup item is not part of the bundled optimization catalog.'
  if (action.type !== item.before.kind || !sameTarget(action, item.action)) return 'This backup item no longer matches its catalog setting, so it was not restored.'
  return action
}

export function trustedRestoreItems(entry: BackupEntry): TrustedRestore {
  const items: InvokeItem[] = []
  const rejected: TrustedRestore['rejected'] = []
  ;[...entry.items].reverse().forEach((item) => {
    const action = trustedAction(entry, item)
    if (typeof action === 'string') rejected.push({ key: item.key, error: action })
    else items.push({ key: item.key, op: 'restore', action, restore: item.before })
  })
  return { items, rejected }
}
