import type { ReactNode } from 'react'
import type { Impact, Risk } from '@shared/catalog'
import type { HealthStatus } from '@shared/types'
import './chip.css'

export type ChipVariant =
  | 'impact-high'
  | 'impact-medium'
  | 'impact-low'
  | 'risk'
  | 'risk-advanced'
  | 'ok'
  | 'fix'
  | 'info'
  | 'danger'
  | 'category'
  | 'reboot'
  | 'pill'

export interface ChipProps {
  variant: ChipVariant
  children: ReactNode
  icon?: ReactNode
  title?: string
}

/** Small uppercase label. 'pill' is the rounded status chip used in the title bar. */
export function Chip({ variant, children, icon, title }: ChipProps) {
  return (
    <span className={`rl-chip rl-chip--${variant}`} title={title}>
      {icon}
      {children}
    </span>
  )
}

export function ImpactChip({ impact }: { impact: Impact }) {
  return <Chip variant={`impact-${impact}`}>{impact.toUpperCase()} IMPACT</Chip>
}

export function RiskChip({ risk }: { risk: Risk }) {
  return <Chip variant={risk === 'advanced' ? 'risk-advanced' : 'risk'}>{risk.toUpperCase()}</Chip>
}

const STATUS_LABEL: Readonly<Record<HealthStatus, string>> = { ok: 'OK', fix: 'FIX', info: 'INFO' }

export function StatusChip({ status }: { status: HealthStatus }) {
  return <Chip variant={status}>{STATUS_LABEL[status]}</Chip>
}
