// Optimizations list filtering and pending-change logic (pure, unit-tested).
import type { Category, Risk, Tweak } from '@shared/catalog'
import type { TweakState } from '@shared/types'

export interface TweakFilter {
  category: Category | 'all'
  risk: Risk | 'all'
  query: string
  recommendedOnly: boolean
}

export const EMPTY_FILTER: TweakFilter = { category: 'all', risk: 'all', query: '', recommendedOnly: false }

export function matchesQuery(tweak: Tweak, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  return [tweak.title, tweak.description, tweak.id, tweak.category].some((field) => field.toLowerCase().includes(q))
}

/** Everything except the category filter (used for per-category counts). */
export function matchesNonCategory(tweak: Tweak, filter: TweakFilter): boolean {
  return (filter.risk === 'all' || tweak.risk === filter.risk) && (!filter.recommendedOnly || tweak.recommended) && matchesQuery(tweak, filter.query)
}

export function filterTweaks(tweaks: readonly Tweak[], filter: TweakFilter): Tweak[] {
  return tweaks.filter((t) => (filter.category === 'all' || t.category === filter.category) && matchesNonCategory(t, filter))
}

/** Count per category (plus 'all') under the non-category filters, in first-seen category order. */
export function categoryCounts(tweaks: readonly Tweak[], filter: TweakFilter): { id: Category | 'all'; count: number }[] {
  const visible = tweaks.filter((t) => matchesNonCategory(t, filter))
  const order: Category[] = []
  const counts = new Map<Category, number>()
  visible.forEach((t) => {
    if (!counts.has(t.category)) order.push(t.category)
    counts.set(t.category, (counts.get(t.category) ?? 0) + 1)
  })
  return [{ id: 'all', count: visible.length }, ...order.map((id) => ({ id, count: counts.get(id) ?? 0 }))]
}

/** A tweak is "on" when every setting it changes is in place. */
export function isOn(state: TweakState | undefined): boolean {
  return state?.state === 'applied'
}

/** Desired toggles that differ from the detected state, split into apply / revert lists. */
export function pendingChanges(desired: Readonly<Record<string, boolean>>, stateById: ReadonlyMap<string, TweakState>): { apply: string[]; revert: string[] } {
  const apply: string[] = []
  const revert: string[] = []
  Object.entries(desired).forEach(([id, want]) => {
    const state = stateById.get(id)
    if (state?.state === 'not-applicable') return
    if (want && !isOn(state)) apply.push(id)
    else if (!want && (state?.state === 'applied' || state?.state === 'partial')) revert.push(id)
  })
  return { apply, revert }
}
