// Settings: dry run, restore points, window behaviour, and honest notes about the app.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Settings } from '@shared/types'
import { useApi } from '../lib/api'
import { useResult } from '../lib/useResult'
import { useAppStatus } from '../shell/appStatus'
import { Card, Page, PageHeader, Skeleton, Toggle, useToast } from '../ui'
import './settings.css'

function SettingRow({ id, title, help, children }: { id: string; title: string; help: ReactNode; children: ReactNode }) {
  return (
    <div className="rl-setting">
      <div className="rl-setting__text">
        <span className="rl-setting__title" id={`${id}-label`}>
          {title}
        </span>
        <span className="rl-setting__help" id={`${id}-help`}>
          {help}
        </span>
      </div>
      {children}
    </div>
  )
}

export function SettingsScreen() {
  const api = useApi()
  const toast = useToast()
  const { status, refresh } = useAppStatus()
  const loadSettings = useCallback(() => api.getSettings(), [api])
  const { state } = useResult(loadSettings)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (state.data !== null) setSettings(state.data)
  }, [state.data])

  const update = (patch: Partial<Settings>): void => {
    setSaving(true)
    api
      .setSettings(patch)
      .then((result) => {
        if (result.ok) {
          setSettings(result.data)
          refresh()
        } else toast.show({ title: 'Could not save settings', message: result.error.message, tone: 'error' })
      })
      .finally(() => setSaving(false))
  }

  return (
    <Page label="Settings">
      <PageHeader title="Settings" eyebrow="Redline Optimizer" />
      <Card title="Safety">
        {settings === null ? (
          <Skeleton height={120} />
        ) : (
          <>
            <SettingRow id="dry-run" title="Dry run" help="Redline reads your settings and reports what each change would do, but writes nothing. Useful to preview everything first.">
              <Toggle checked={settings.dryRun} label="Dry run" describedBy="dry-run-help" disabled={saving} onChange={(dryRun) => update({ dryRun })} />
            </SettingRow>
            <SettingRow id="restore" title="Restore point before applying" help="Creates a Windows restore point before each batch of changes. Windows allows one new point every 24 hours.">
              <Toggle checked={settings.restorePointBeforeApply} label="Restore point before applying" describedBy="restore-help" disabled={saving} onChange={(restorePointBeforeApply) => update({ restorePointBeforeApply })} />
            </SettingRow>
          </>
        )}
      </Card>
      <Card title="Window">
        {settings === null ? (
          <Skeleton height={56} />
        ) : (
          <SettingRow id="tray" title="Close to tray" help="Closing the window keeps Redline in the notification area instead of quitting.">
            <Toggle checked={settings.closeToTray} label="Close to tray" describedBy="tray-help" disabled={saving} onChange={(closeToTray) => update({ closeToTray })} />
          </SettingRow>
        )}
      </Card>
      <Card title="About">
        <dl className="rl-about">
          <div>
            <dt>Version</dt>
            <dd className="rl-mono">{status?.appVersion ?? '…'}</dd>
          </div>
          <div>
            <dt>Running as administrator</dt>
            <dd>{status === null ? '…' : status.elevated ? 'Yes' : 'No (read-only)'}</dd>
          </div>
          <div>
            <dt>Supported Windows</dt>
            <dd>{status === null ? '…' : status.platformOk ? 'Yes' : 'No'}</dd>
          </div>
        </dl>
        <ul className="rl-about__notes">
          <li>Redline only changes documented Windows settings and keeps a backup of every value it touches.</li>
          <li>It never turns off Defender, Windows Update, UAC, the firewall or CPU security mitigations. The Debloat screen lists what it leaves out and why.</li>
          <li>Most tweaks have a small effect on their own. Game settings, GPU drivers and keeping background apps quiet matter most for FPS.</li>
          <li>This build is not code-signed, so Windows SmartScreen and the UAC prompt show an unknown publisher.</li>
          <li>Settings, backups and logs are stored in your AppData\Roaming\Redline Optimizer folder.</li>
        </ul>
      </Card>
    </Page>
  )
}
