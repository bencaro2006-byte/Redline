import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './button.css'

export type ButtonVariant = 'primary' | 'ghost' | 'subtle'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = accent fill, ghost = outline on transparent, subtle = raised graphite. */
  variant?: ButtonVariant
  /** sm 36px, md 44px, lg 46px tall. */
  size?: ButtonSize
  icon?: ReactNode
  /** Shows a spinner, sets aria-busy and blocks clicks. */
  loading?: boolean
  fullWidth?: boolean
}

export function Button({
  variant = 'subtle',
  size = 'md',
  icon,
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = ['rl-btn', `rl-btn--${variant}`, `rl-btn--${size}`, fullWidth ? 'rl-btn--full' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  return (
    <button {...rest} type={type} className={classes} disabled={disabled === true || loading} aria-busy={loading || undefined}>
      {loading ? <span className="rl-btn__spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
}
