// Explains read-only mode (not elevated) and dry-run mode above every screen.
import { FlaskConical, ShieldAlert } from 'lucide-react'
import { useAppStatus } from './appStatus'
import { useNavigation } from './navigation'

export function StatusBanner() {
  const { status, isMock } = useAppStatus()
  const { navigate } = useNavigation()
  if (status === null) return null

  if (!status.elevated && !status.dryRun) {
    return (
      <div className="rl-banner rl-banner--warn" role="status">
        <ShieldAlert size={16} aria-hidden="true" />
        <span>Redline is not running as administrator, so it can only read settings. Close it and start it again with “Run as administrator”.</span>
      </div>
    )
  }
  if (status.dryRun) {
    return (
      <div className="rl-banner rl-banner--info" role="status">
        <FlaskConical size={16} aria-hidden="true" />
        <span>
          Dry run is on: Redline shows what each change would do without writing anything.
          {isMock ? ' (Browser preview with sample data.)' : ''}
        </span>
        <button type="button" className="rl-banner__action" onClick={() => navigate('settings')}>
          Settings
        </button>
      </div>
    )
  }
  return null
}
