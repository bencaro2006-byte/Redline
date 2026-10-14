import type { ReactNode } from 'react'
import './page.css'

export interface PageHeaderProps {
  title: string
  /** Uppercase letter-spaced context line above the title. */
  eyebrow?: ReactNode
  actions?: ReactNode
}

/** Screen heading block: eyebrow + h1 on the left, actions on the right. */
export function PageHeader({ title, eyebrow, actions }: PageHeaderProps) {
  return (
    <div className="rl-page-header">
      <div className="rl-page-header__titles">
        {eyebrow !== undefined && <span className="rl-eyebrow">{eyebrow}</span>}
        <h1 className="rl-page-header__title">{title}</h1>
      </div>
      {actions !== undefined && <div className="rl-page-header__actions">{actions}</div>}
    </div>
  )
}

/** Standard screen container: page padding and vertical rhythm. */
export function Page({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="rl-page" aria-label={label}>
      {children}
    </div>
  )
}
