import type { ReactNode } from 'react'
import { Chip } from '../ui'
import { useAppStatus } from './appStatus'
import { FlaskIcon, ShieldIcon, ShieldOffIcon } from './icons'
import { Logo } from './Logo'

/**
 * Custom title bar. Windows draws min/max/close over the right edge
 * (titleBarOverlay), so the bar sizes itself with the Window Controls Overlay
 * env() variables and every interactive child opts out of the drag region.
 */
export function TitleBar({ extra }: { extra?: ReactNode }) {
  const { status, isMock } = useAppStatus()
  return (
    <header className="rl-titlebar">
      <div className="rl-titlebar__drag">
        <Logo />
        <div className="rl-titlebar__spacer" />
        {isMock && <Chip variant="pill">Browser preview · mock data</Chip>}
        {status?.dryRun === true && (
          <Chip variant="pill" icon={<FlaskIcon size={13} className="rl-titlebar__icon--dry" />} title="Changes are simulated. Turn off dry-run in Settings to apply them.">
            Dry-run
          </Chip>
        )}
        {status !== null &&
          (status.elevated ? (
            <Chip variant="pill" icon={<ShieldIcon size={13} className="rl-titlebar__icon--admin" />}>
              Administrator
            </Chip>
          ) : (
            <Chip variant="pill" icon={<ShieldOffIcon size={13} className="rl-titlebar__icon--warn" />} title="Start Redline as administrator to apply changes.">
              Not elevated
            </Chip>
          ))}
        {extra}
      </div>
    </header>
  )
}
