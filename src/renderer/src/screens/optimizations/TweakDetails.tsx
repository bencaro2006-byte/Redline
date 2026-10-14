import type { ReactNode } from 'react'
import type { Tweak } from '@shared/catalog'
import type { TweakState } from '@shared/types'
import { describeApply, describeDefault } from '../../features/describe'
import { CATEGORY_LABEL, STATE_LABEL } from '../../features/labels'
import { Button, Chip, ImpactChip, Modal, RiskChip } from '../../ui'

export interface TweakDetailsProps {
  tweak: Tweak | null
  state: TweakState | undefined
  onClose: () => void
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rl-details__section">
      <h3 className="rl-details__heading">{title}</h3>
      {children}
    </section>
  )
}

/** Everything known about one tweak: what it does, what to expect, the exact changes and how undo works. */
export function TweakDetails({ tweak, state, onClose }: TweakDetailsProps) {
  if (tweak === null) return null
  return (
    <Modal open size="lg" title={tweak.title} description={tweak.description} onClose={onClose} actions={<Button onClick={onClose}>Close</Button>}>
      <div className="rl-details">
        <div className="rl-tweak__chips">
          <Chip variant="category">{CATEGORY_LABEL[tweak.category].toUpperCase()}</Chip>
          <ImpactChip impact={tweak.impact} />
          <RiskChip risk={tweak.risk} />
          {tweak.requiresReboot && <Chip variant="reboot">REBOOT</Chip>}
          {state !== undefined && <Chip variant="pill">{STATE_LABEL[state.state]}</Chip>}
        </div>
        {state?.detail !== undefined && <p className="rl-details__state rl-muted">{state.detail}</p>}
        <Section title="What to expect">
          <p>{tweak.impactNote}</p>
        </Section>
        <Section title={tweak.recommended ? 'Why it is recommended for this PC' : 'Why it is not pre-selected'}>
          <p>{tweak.recommendReason}</p>
        </Section>
        {tweak.sideEffects !== '' && (
          <Section title="Side effects">
            <p>{tweak.sideEffects}</p>
          </Section>
        )}
        <Section title="Exact changes">
          <ul className="rl-details__code rl-selectable">
            {tweak.actions.map((action, i) => (
              <li key={i}>{describeApply(action)}</li>
            ))}
          </ul>
        </Section>
        <Section title="Undo">
          <p className="rl-muted">Redline saves every value before changing it and puts that value back. If it never changed this tweak, turning it off restores the Windows default:</p>
          <ul className="rl-details__code rl-selectable">
            {tweak.actions.map((action, i) => (
              <li key={i}>{describeDefault(action)}</li>
            ))}
          </ul>
        </Section>
        {tweak.sources.length > 0 && (
          <Section title="Sources">
            <ul className="rl-details__sources rl-selectable">
              {tweak.sources.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </Modal>
  )
}
