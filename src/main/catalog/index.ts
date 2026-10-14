// Bundled tweak catalog: imported as JSON (bundled into the main build by Vite),
// validated once with zod, deep-frozen, and queried through these helpers.
import type { AppxEntry, Catalog, CommandAction, Tweak, TweakAction } from '@shared/catalog'
import { z } from 'zod'
import raw from './catalog.json'
import { CatalogSchema, matchesAnyPackagePattern } from './schema'

let cached: Readonly<Catalog> | null = null
let byId: ReadonlyMap<string, Tweak> = new Map()
let commandKeys: ReadonlySet<string> = new Set()

/** Identity of a command action: all three PowerShell strings, byte for byte. */
export function commandKey(action: Pick<CommandAction, 'apply' | 'revert' | 'detect'>): string {
  return JSON.stringify([action.apply, action.revert, action.detect])
}

export class CatalogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CatalogError'
  }
}

/** Validates any catalog-shaped value. Throws CatalogError with a readable report. */
export function parseCatalog(value: unknown): Catalog {
  const parsed = CatalogSchema.safeParse(value)
  if (!parsed.success) throw new CatalogError(`Invalid tweak catalog:\n${z.prettifyError(parsed.error)}`)
  return parsed.data
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

/** The validated bundled catalog (validated on first call; throws CatalogError if invalid). */
export function getCatalog(): Readonly<Catalog> {
  if (cached === null) {
    const catalog = deepFreeze(parseCatalog(raw as unknown))
    byId = new Map(catalog.tweaks.map((t) => [t.id, t]))
    commandKeys = new Set(
      catalog.tweaks.flatMap((t) => t.actions).flatMap((a) => (a.type === 'command' ? [commandKey(a)] : [])),
    )
    cached = catalog
  }
  return cached
}

export function getTweak(id: string): Tweak | undefined {
  getCatalog()
  return byId.get(id)
}

/** true only for a command action whose strings are exactly those of a bundled catalog command. */
export function isCatalogCommand(action: Pick<CommandAction, 'apply' | 'revert' | 'detect'>): boolean {
  getCatalog()
  return commandKeys.has(commandKey(action))
}

/** The bundled catalog action for an action key like "game-mode-on#0", or undefined. */
export function catalogActionForKey(key: string): TweakAction | undefined {
  const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)#(\d{1,3})$/.exec(key)
  if (match === null) return undefined
  const [, id, index] = match
  return id !== undefined && index !== undefined ? getTweak(id)?.actions[Number(index)] : undefined
}

export function isKnownTweakId(id: string): boolean {
  return getTweak(id) !== undefined
}

/** Protected packages (neverRemove supports "*" wildcards, e.g. "Microsoft.VCLibs.*"). */
export function isNeverRemove(pkg: string): boolean {
  return matchesAnyPackagePattern(
    pkg,
    getCatalog().neverRemove.map((n) => n.package),
  )
}

export function getAppxEntry(pkg: string): AppxEntry | undefined {
  const lower = pkg.toLowerCase()
  return getCatalog().appx.find((a) => a.package.toLowerCase() === lower)
}

/** A package may be removed only if it is in the catalog appx list and not protected. */
export function isRemovableAppx(pkg: string): boolean {
  return getAppxEntry(pkg) !== undefined && !isNeverRemove(pkg)
}

/** Hostnames of every https source link in the catalog (used for the external-link allowlist). */
export function sourceHosts(): string[] {
  const hosts = new Set<string>()
  getCatalog().tweaks.forEach((t) =>
    t.sources.forEach((s) => {
      try {
        hosts.add(new URL(s).hostname)
      } catch {
        // Already validated as a URL by the schema.
      }
    }),
  )
  return [...hosts]
}
