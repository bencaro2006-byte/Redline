import { useId, type ReactNode } from 'react'
import './card.css'

export interface CardProps {
  /** Card heading (h2). Labels the section for assistive tech. */
  title?: ReactNode
  /** Uppercase letter-spaced label above or instead of the title. */
  eyebrow?: ReactNode
  /** Right-aligned header content (links, buttons, counters). */
  actions?: ReactNode
  /** 'raised' is the lighter summary surface (e.g. the Debloat "Selected" card). */
  variant?: 'default' | 'raised'
  /** Padding preset: 'md' 22/24px, 'lg' 26/28px. */
  padding?: 'md' | 'lg'
  className?: string
  children?: ReactNode
}

export function Card({ title, eyebrow, actions, variant = 'default', padding = 'md', className, children }: CardProps) {
  const headingId = useId()
  const hasHeader = title !== undefined || eyebrow !== undefined || actions !== undefined
  const labelled = title !== undefined ? headingId : undefined
  return (
    <section
      aria-labelledby={labelled}
      className={`rl-card rl-card--${variant} rl-card--pad-${padding}${className ? ` ${className}` : ''}`}
    >
      {hasHeader && (
        <header className="rl-card__header">
          <div className="rl-card__titles">
            {eyebrow !== undefined && <span className="rl-eyebrow">{eyebrow}</span>}
            {title !== undefined && (
              <h2 id={headingId} className="rl-card__title">
                {title}
              </h2>
            )}
          </div>
          {actions !== undefined && <div className="rl-card__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/** A bordered row inside a Card (the design's list rows with a top hairline). */
export function CardRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`rl-card-row${className ? ` ${className}` : ''}`}>{children}</div>
}
