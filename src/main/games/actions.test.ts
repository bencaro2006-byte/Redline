import { describe, expect, it } from 'vitest'
import type { GameProfile } from '@shared/types'
import { TweakActionSchema } from '../catalog/schema'
import {
  CPU_PRIORITY_HIGH,
  FSO_FLAG,
  addLayerFlag,
  changedFlags,
  cpuPriorityAction,
  gameKey,
  gpuPreferenceAction,
  layersAction,
  removeLayerFlag,
  validateExePath,
} from './actions'

const profile: GameProfile = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  exePath: 'C:\\Games\\Counter-Strike 2\\game\\bin\\win64\\cs2.exe',
  exeName: 'cs2.exe',
  gpuHighPerformance: false,
  disableFullscreenOptimizations: false,
  highCpuPriority: false,
}

describe('validateExePath', () => {
  it('accepts normal game paths and returns the file name', () => {
    expect(validateExePath('C:\\Games\\Counter-Strike 2\\game\\bin\\win64\\cs2.exe')).toEqual({ ok: true, path: profile.exePath, name: 'cs2.exe' })
    expect(validateExePath('D:\\SteamLibrary\\steamapps\\common\\Apex Legends\\r5apex_dx12.exe')).toMatchObject({ ok: true, name: 'r5apex_dx12.exe' })
  })

  it('rejects relative, network, non-exe, odd-name and over-long paths', () => {
    expect(validateExePath('game.exe').ok).toBe(false)
    expect(validateExePath('\\\\server\\share\\game.exe').ok).toBe(false)
    expect(validateExePath('C:\\Games\\readme.txt').ok).toBe(false)
    expect(validateExePath('C:\\Games\\bad;name.exe').ok).toBe(false)
    expect(validateExePath(`C:\\${'a'.repeat(240)}\\game.exe`).ok).toBe(false)
  })
})

describe('registry actions', () => {
  it('builds valid catalog-shaped registry actions', () => {
    for (const action of [gpuPreferenceAction(profile), cpuPriorityAction(profile), layersAction(profile, `~ ${FSO_FLAG}`)]) {
      expect(TweakActionSchema.safeParse(action).success).toBe(true)
    }
    expect(gpuPreferenceAction(profile)).toMatchObject({ hive: 'HKCU', name: profile.exePath, value: 'GpuPreference=2;' })
    expect(cpuPriorityAction(profile)).toMatchObject({
      hive: 'HKLM',
      path: 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\cs2.exe\\PerfOptions',
      name: 'CpuPriorityClass',
      value: CPU_PRIORITY_HIGH,
    })
  })

  it('uses one stable key per game and flag', () => {
    expect(gameKey(profile.id, 'highCpuPriority')).toBe(`game-${profile.id}-highCpuPriority#0`)
  })
})

describe('compatibility layer flags', () => {
  it('adds the flag with the tilde prefix and keeps other flags', () => {
    expect(addLayerFlag(null)).toBe(`~ ${FSO_FLAG}`)
    expect(addLayerFlag('~ RUNASADMIN')).toBe(`~ RUNASADMIN ${FSO_FLAG}`)
    expect(addLayerFlag(`~ ${FSO_FLAG}`)).toBe(`~ ${FSO_FLAG}`)
    expect(addLayerFlag('HIGHDPIAWARE')).toBe(`HIGHDPIAWARE ${FSO_FLAG}`)
  })

  it('removes only its own flag and reports when nothing is left', () => {
    expect(removeLayerFlag(`~ RUNASADMIN ${FSO_FLAG}`)).toBe('~ RUNASADMIN')
    expect(removeLayerFlag(`~ ${FSO_FLAG}`)).toBeNull()
    expect(removeLayerFlag(null)).toBeNull()
    expect(removeLayerFlag('~ HIGHDPIAWARE')).toBe('~ HIGHDPIAWARE')
  })
})

describe('changedFlags', () => {
  it('lists only flags that differ', () => {
    expect(changedFlags(profile, { gpuHighPerformance: true, disableFullscreenOptimizations: false, highCpuPriority: true })).toEqual([
      { flag: 'gpuHighPerformance', on: true },
      { flag: 'highCpuPriority', on: true },
    ])
    expect(changedFlags(profile, { gpuHighPerformance: false, disableFullscreenOptimizations: false, highCpuPriority: false })).toEqual([])
  })
})
