import { memo } from 'react'
import type { Tweak } from '@shared/catalog'
import type { TweakState } from '@shared/types'
import { CATEGORY_LABEL, STATE_LABEL } from '../../features/labels'
import { Chip, ImpactChip, RiskChip, Toggle } from '../../ui'

export interface TweakCardProps {
  tweak: Tweak
  state: TweakState | undefined
  /** Desired toggle position (pending value or the detected state). */
  checked: boolean
  pending: boolean
  disabled: boolean
  onToggle: (id: string, next: boolean) => void
  onDetails: (id: string) => void
}

const STATE_VARIANT = { applied: 'ok', partial: 'fix', 'not-applicable': 'category', unknown: 'category', 'not-applied': null } as const

function TweakCardImpl({ tweak, state, checked, pending, disabled, onToggle, onDetails }: TweakCardProps) {
  const descId = `tweak-desc-${tweak.id}`
  const kind = state?.state
  const variant = kind !== undefined ? STATE_VARIANT[kind] : null
  return (
    <article className={`rl-tweak${pending ? ' rl-tweak--pending' : ''}`}>
      <div className="rl-tweak__head">
        <div className="rl-tweak__text">
          <h2 className="rl-tweak__title">{tweak.title}</h2>
          <p id={descId} className="rl-tweak__desc">
            {tweak.description}
          </p>
        </div>
        <Toggle
          checked={checked}
          label={tweak.title}
          describedBy={descId}
          pending={pending}
          disabled={disabled || kind === 'not-applicable'}
          onChange={(next) => onToggle(tweak.id, next)}
        />
      </div>
      <div className="rl-tweak__chips">
        <Chip variant="category">{CATEGORY_LABEL[tweak.category].toUpperCase()}</Chip>
        <ImpactChip impact={tweak.impact} />
        <RiskChip risk={tweak.risk} />
        {tweak.requiresReboot && <Chip variant="reboot">REBOOT</Chip>}
        {tweak.recommended && <Chip variant="pill">Recommended</Chip>}
        {variant !== null && kind !== undefined && (
          <Chip variant={variant} title={state?.detail}>
            {STATE_LABEL[kind]}
          </Chip>
        )}
        <span className="rl-tweak__spacer" />
        {pending && <span className="rl-tweak__pending">Pending</span>}
        <button type="button" className="rl-link rl-tweak__details" onClick={() => onDetails(tweak.id)} aria-label={`Details for ${tweak.title}`}>
          Details
        </button>
      </div>
    </article>
  )
}

export const TweakCard = memo(TweakCardImpl)
