// Preinstalled Store apps: Get-Appx.ps1 (read-only listing) and Remove-Appx.ps1
// (Remove-AppxPackage -AllUsers + Remove-AppxProvisionedPackage -Online; honours dryRun).
// Packages arrive pre-validated by IPC (catalog appx list, never neverRemove); checked again here.
import { z } from 'zod'
import type { RemoveAppxResult } from '@shared/api'
import type { AppxState } from '@shared/types'
import { getCatalog, isRemovableAppx } from '../catalog'
import { IpcError } from '../ipc/errors'
import { runScript } from '../ps/runner'

const ListDataSchema = z.object({ installed: z.array(z.string()), allUsers: z.boolean() })
const RemoveDataSchema = z.object({
  results: z.array(z.object({ package: z.string(), ok: z.boolean(), removed: z.boolean(), error: z.string().optional() })),
})

/** Catalog entries merged with the installed state (pure). */
export function mergeInstalled(entries: readonly AppxState[] | readonly Omit<AppxState, 'installed'>[], installed: readonly string[]): AppxState[] {
  const present = new Set(installed.map((p) => p.toLowerCase()))
  return entries.map((entry) => ({ ...entry, installed: present.has(entry.package.toLowerCase()) }))
}

export async function listAppx(): Promise<AppxState[]> {
  const entries = getCatalog().appx
  const data = await runScript('getAppx', { packages: entries.map((e) => e.package) }, ListDataSchema)
  return mergeInstalled(entries, data.installed)
}

export async function removeAppx(packages: readonly string[], dryRun: boolean): Promise<RemoveAppxResult> {
  const blocked = packages.find((p) => !isRemovableAppx(p))
  if (blocked !== undefined) throw new IpcError('INVALID_INPUT', `Not removable: ${blocked}`)
  const data = await runScript('removeAppx', { dryRun, packages }, RemoveDataSchema)
  return {
    removed: data.results.filter((r) => r.ok && r.removed).map((r) => r.package),
    failed: data.results.filter((r) => !r.ok).map((r) => ({ package: r.package, error: r.error ?? 'Failed' })),
    dryRun,
  }
}
