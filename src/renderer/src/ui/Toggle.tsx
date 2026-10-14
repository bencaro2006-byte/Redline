import './toggle.css'

export interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  /** Accessible name (required: the switch has no visible text of its own). */
  label: string
  disabled?: boolean
  /** Outline the track to show the value differs from what is applied. */
  pending?: boolean
  id?: string
  describedBy?: string
}

export function Toggle({ checked, onChange, label, disabled = false, pending = false, id, describedBy }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      className={`rl-toggle${checked ? ' rl-toggle--on' : ''}${pending ? ' rl-toggle--pending' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="rl-toggle__knob" aria-hidden="true" />
    </button>
  )
}
