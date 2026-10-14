import { describe, expect, it } from 'vitest'
import { ApplyTweaksReq, NoArgs, RemoveAppxReq, RevertBackupReq, SettingsPatch } from './schemas'

describe('IPC request schemas', () => {
  it('accepts known tweak ids and rejects unknown or duplicate ones', () => {
    expect(ApplyTweaksReq.safeParse({ ids: ['menu-show-delay-short'], mode: 'apply' }).success).toBe(true)
    expect(ApplyTweaksReq.safeParse({ ids: ['not-a-tweak'], mode: 'apply' }).success).toBe(false)
    expect(ApplyTweaksReq.safeParse({ ids: ['menu-show-delay-short', 'menu-show-delay-short'], mode: 'apply' }).success).toBe(false)
    expect(ApplyTweaksReq.safeParse({ ids: [], mode: 'apply' }).success).toBe(false)
    expect(ApplyTweaksReq.safeParse({ ids: ['menu-show-delay-short'], mode: 'apply', extra: 1 }).success).toBe(false)
  })

  it('only allows removable catalog packages', () => {
    expect(RemoveAppxReq.safeParse({ packages: ['Microsoft.BingWeather'] }).success).toBe(true)
    expect(RemoveAppxReq.safeParse({ packages: ['Microsoft.WindowsStore'] }).success).toBe(false)
    expect(RemoveAppxReq.safeParse({ packages: ['Microsoft.VCLibs.140.00'] }).success).toBe(false)
    expect(RemoveAppxReq.safeParse({ packages: ['Contoso.Unknown'] }).success).toBe(false)
  })

  it('validates ids, settings patches and argument-less calls', () => {
    expect(RevertBackupReq.safeParse({ backupId: '..\\evil' }).success).toBe(false)
    expect(RevertBackupReq.safeParse({ backupId: 'c0ffee-12' }).success).toBe(true)
    expect(SettingsPatch.safeParse({}).success).toBe(false)
    expect(SettingsPatch.safeParse({ dryRun: false }).success).toBe(true)
    expect(SettingsPatch.safeParse({ dryRun: 'no' }).success).toBe(false)
    expect(NoArgs.safeParse(undefined).success).toBe(true)
    expect(NoArgs.safeParse({ path: 'x' }).success).toBe(false)
  })
})
