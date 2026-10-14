import { describe, expect, it } from 'vitest'
import type { BackupEntry, BackupItem } from '@shared/types'
import { getTweak } from '../catalog'
import { invoke } from './invoke'
import { trustedRestoreItems } from './trust'

const entry = (kind: BackupEntry['kind'], items: BackupItem[]): BackupEntry => ({
  id: 'e1',
  createdAt: '2026-10-10T12:00:00.000Z',
  tweakIds: [],
  kind,
  label: 'x',
  items,
  revertedAt: null,
})

const payload = { type: 'command' as const, apply: 'x', revert: 'Start-Process calc.exe', detect: '$true' }

describe('trustedRestoreItems (tampered backups)', () => {
  it('uses the catalog action, never the stored one, for a known key', () => {
    const catalogAction = getTweak('menu-show-delay-short')?.actions[0]
    if (catalogAction?.type !== 'registry') throw new Error('catalog changed')
    // Same setting, but the stored copy claims a different value and default.
    const edited: BackupItem = {
      key: 'menu-show-delay-short#0',
      action: { ...catalogAction, value: '0', default: null },
      before: { kind: 'registry', exists: true, valueType: 'REG_SZ', value: '400' },
    }
    const { items, rejected } = trustedRestoreItems(entry('tweaks', [edited]))
    expect(rejected).toEqual([])
    expect(items[0]?.action).toEqual(catalogAction)
  })

  it('rejects a stored item that points at a different setting than the catalog action', () => {
    const redirected: BackupItem = {
      key: 'menu-show-delay-short#0',
      action: { type: 'registry', hive: 'HKLM', path: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', name: 'evil', valueType: 'REG_SZ', value: 'c:\\evil.exe', default: null },
      before: { kind: 'registry', exists: true, valueType: 'REG_SZ', value: 'c:\\evil.exe' },
    }
    const { items, rejected } = trustedRestoreItems(entry('tweaks', [redirected]))
    expect(items).toEqual([])
    expect(rejected[0]?.error).toMatch(/no longer matches/)
  })

  it('rejects unknown keys and kind mismatches (e.g. a smuggled command)', () => {
    const { items, rejected } = trustedRestoreItems(
      entry('tweaks', [
        { key: 'not-a-tweak#0', action: payload, before: { kind: 'command', detected: false } },
        { key: 'menu-show-delay-short#0', action: payload, before: { kind: 'command', detected: false } },
      ]),
    )
    expect(items).toEqual([])
    expect(rejected.map((r) => r.key)).toEqual(['menu-show-delay-short#0', 'not-a-tweak#0'])
  })

  it('accepts game items only in the three shapes Redline writes', () => {
    const exe = 'C:\\Games\\cs2.exe'
    const ok: BackupItem = {
      key: 'game-g1-gpuHighPerformance#0',
      action: { type: 'registry', hive: 'HKCU', path: 'Software\\Microsoft\\DirectX\\UserGpuPreferences', name: exe, valueType: 'REG_SZ', value: 'GpuPreference=2;', default: null },
      before: { kind: 'registry', exists: false, valueType: null, value: null },
    }
    const ifeo: BackupItem = {
      key: 'game-g1-highCpuPriority#0',
      action: { type: 'registry', hive: 'HKLM', path: 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\cs2.exe\\PerfOptions', name: 'CpuPriorityClass', valueType: 'REG_DWORD', value: 3, default: null },
      before: { kind: 'registry', exists: false, valueType: null, value: null },
    }
    const debuggerHijack: BackupItem = {
      key: 'game-g1-highCpuPriority#0',
      action: { type: 'registry', hive: 'HKLM', path: 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\cs2.exe', name: 'Debugger', valueType: 'REG_SZ', value: 'c:\\evil.exe', default: null },
      before: { kind: 'registry', exists: true, valueType: 'REG_SZ', value: 'c:\\evil.exe' },
    }
    const smuggled: BackupItem = { key: 'game-g1-gpuHighPerformance#0', action: payload, before: { kind: 'command', detected: false } }
    const { items, rejected } = trustedRestoreItems(entry('game', [ok, ifeo, debuggerHijack, smuggled]))
    expect(items.map((i) => i.key)).toEqual(['game-g1-highCpuPriority#0', 'game-g1-gpuHighPerformance#0'])
    expect(rejected.length).toBe(2)
  })
})

describe('invoke guard', () => {
  it('refuses a command action that is not byte-identical to a catalog command, without running anything', async () => {
    const results = await invoke([{ key: 'x#0', op: 'restore', action: payload, restore: { kind: 'command', detected: false } }], true)
    expect(results).toEqual([{ key: 'x#0', ok: false, changed: false, error: expect.stringMatching(/not part of the bundled catalog/) }])
  })
})
