import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import './empty-state.css'

export interface EmptyStateProps {
  title: string
  message?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  /** 'error' tints the icon for failed loads. */
  tone?: 'neutral' | 'error'
}

export function EmptyState({ title, message, icon, action, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div className={`rl-empty rl-empty--${tone}`}>
      <span className="rl-empty__icon" aria-hidden="true">
        {icon ?? <Inbox size={26} strokeWidth={1.8} />}
      </span>
      <p className="rl-empty__title">{title}</p>
      {message !== undefined && <p className="rl-empty__message">{message}</p>}
      {action !== undefined && <div className="rl-empty__action">{action}</div>}
    </div>
  )
}
