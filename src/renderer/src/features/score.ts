// Optimization score and recommendation helpers (pure, unit-tested).
// Score = impact-weighted share of RECOMMENDED tweaks that are in place on this PC.
// It measures how much of Redline's advice is applied, not FPS.
import type { Impact, Tweak } from '@shared/catalog'
import type { TweakState } from '@shared/types'

export const IMPACT_WEIGHT: Readonly<Record<Impact, number>> = { high: 3, medium: 2, low: 1 }
const IMPACT_RANK: Readonly<Record<Impact, number>> = { high: 0, medium: 1, low: 2 }

export interface Score {
  /** 0-100, null until tweak states are known. */
  percent: number | null
  /** Recommended tweaks fully applied. */
  applied: number
  /** Recommended tweaks that apply to this PC. */
  total: number
  /** Recommended tweaks not (fully) applied, in suggested order. */
  pending: Tweak[]
}

export function isActive(state: TweakState | undefined): boolean {
  return state?.state === 'applied'
}

/** Applies to this PC: not marked not-applicable. Unknown states still count. */
export function isApplicable(state: TweakState | undefined): boolean {
  return state?.state !== 'not-applicable'
}

export function byImpact(a: Tweak, b: Tweak): number {
  return IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact]
}

export function computeScore(tweaks: readonly Tweak[], stateById: ReadonlyMap<string, TweakState>, statesKnown: boolean): Score {
  const recommended = tweaks.filter((t) => t.recommended && isApplicable(stateById.get(t.id)))
  const weight = (t: Tweak): number => IMPACT_WEIGHT[t.impact]
  const totalWeight = recommended.reduce((sum, t) => sum + weight(t), 0)
  const earned = recommended.reduce((sum, t) => {
    const state = stateById.get(t.id)?.state
    return sum + (state === 'applied' ? weight(t) : state === 'partial' ? weight(t) / 2 : 0)
  }, 0)
  const pending = recommended.filter((t) => !isActive(stateById.get(t.id))).sort(byImpact)
  return {
    percent: statesKnown && totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : statesKnown ? 100 : null,
    applied: recommended.length - pending.length,
    total: recommended.length,
    pending,
  }
}
