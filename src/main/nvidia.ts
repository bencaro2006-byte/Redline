// Opens the NVIDIA Control Panel (Store app) through the shell, without any
// renderer-supplied path or argument. explorer.exe hands the request to the running,
// non-elevated shell, so the panel does not inherit Redline's admin token.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IpcError } from './ipc/errors'
import { hardenedEnv, safeSystemRoot } from './ps/env'

const SYSTEM_ROOT = safeSystemRoot()
const EXPLORER = join(SYSTEM_ROOT, 'explorer.exe')
/** AUMID of the Store NVIDIA Control Panel (confirmed with Get-StartApps on the target PC). */
export const NVIDIA_CONTROL_PANEL_AUMID = 'NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj!NVIDIACorp.NVIDIAControlPanel'
const LEGACY_PANEL = join(SYSTEM_ROOT, 'System32', 'nvcplui.exe')

function launch(file: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, [...args], { shell: false, windowsHide: false, detached: true, stdio: 'ignore', env: hardenedEnv() })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

export async function openNvidiaControlPanel(): Promise<true> {
  try {
    const target = existsSync(LEGACY_PANEL) ? LEGACY_PANEL : `shell:AppsFolder\\${NVIDIA_CONTROL_PANEL_AUMID}`
    await launch(EXPLORER, [target])
    return true
  } catch (err) {
    throw new IpcError('FAILED', `Could not open the NVIDIA Control Panel: ${err instanceof Error ? err.message : String(err)}`)
  }
}
