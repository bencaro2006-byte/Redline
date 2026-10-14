import { describe, expect, it } from 'vitest'
import raw from './catalog.json'
import { CatalogError, getCatalog, isNeverRemove, isRemovableAppx, parseCatalog } from './index'
import { matchesAnyPackagePattern, regValueMatchesType } from './schema'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe('bundled catalog', () => {
  it('passes the zod schema', () => {
    const catalog = getCatalog()
    expect(catalog.tweaks.length).toBeGreaterThan(0)
    expect(catalog.appx.length).toBeGreaterThan(0)
  })

  it('has unique tweak ids', () => {
    const ids = getCatalog().tweaks.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is deep-frozen', () => {
    const tweak = getCatalog().tweaks[0]
    expect(Object.isFrozen(tweak)).toBe(true)
    expect(Object.isFrozen(tweak?.actions[0])).toBe(true)
  })
})

describe('catalog schema', () => {
  it('rejects a registry value that does not match its type', () => {
    const bad = clone(raw) as { tweaks: { actions: Record<string, unknown>[] }[] }
    const action = bad.tweaks.flatMap((t) => t.actions).find((a) => a['valueType'] === 'REG_DWORD')
    expect(action).toBeDefined()
    if (action) action['value'] = 'not a number'
    expect(() => parseCatalog(bad)).toThrow(CatalogError)
  })

  it('rejects duplicate tweak ids', () => {
    const bad = clone(raw) as { tweaks: { id: string }[] }
    const [first, second] = bad.tweaks
    if (first && second) second.id = first.id
    expect(() => parseCatalog(bad)).toThrow(/duplicate tweak id/)
  })

  it('rejects an appx entry that is also protected', () => {
    const bad = clone(raw) as { appx: { package: string }[] }
    const first = bad.appx[0]
    if (first) first.package = 'Microsoft.WindowsStore'
    expect(() => parseCatalog(bad)).toThrow(/neverRemove/)
  })

  it('checks registry value shapes per type', () => {
    expect(regValueMatchesType('REG_DWORD', 0xffffffff)).toBe(true)
    expect(regValueMatchesType('REG_DWORD', -1)).toBe(false)
    expect(regValueMatchesType('REG_BINARY', '9032078010000000')).toBe(true)
    expect(regValueMatchesType('REG_BINARY', '903')).toBe(false)
    expect(regValueMatchesType('REG_MULTI_SZ', ['a', 'b'])).toBe(true)
  })
})

describe('package protection', () => {
  it('matches wildcard neverRemove patterns case-insensitively', () => {
    expect(matchesAnyPackagePattern('microsoft.vclibs.140.00', ['Microsoft.VCLibs.*'])).toBe(true)
    expect(matchesAnyPackagePattern('Microsoft.VCLibsX', ['Microsoft.VCLibs.*'])).toBe(false)
    expect(isNeverRemove('Microsoft.VCLibs.140.00.UWPDesktop')).toBe(true)
    expect(isNeverRemove('NVIDIACorp.NVIDIAControlPanel')).toBe(true)
  })

  it('allows only catalog appx entries that are not protected', () => {
    expect(isRemovableAppx('Microsoft.BingWeather')).toBe(true)
    expect(isRemovableAppx('Microsoft.WindowsStore')).toBe(false)
    expect(isRemovableAppx('Some.Random.App')).toBe(false)
  })
})

// The product promise: Redline never weakens Windows security. This guards the catalog content.
describe('catalog never touches security features', () => {
  const actions = getCatalog().tweaks.flatMap((t) => t.actions.map((a) => ({ id: t.id, a })))
  const PROTECTED_SERVICES = /^(WinDefend|Sense|WdNisSvc|WdNisDrv|WdFilter|WdBoot|SecurityHealthService|wscsvc|wuauserv|UsoSvc|WaaSMedicSvc|mpssvc|BFE|SgrmBroker|EventLog|CryptSvc|AppIDSvc|VaultSvc)$/i
  const PROTECTED_VALUES = /^(EnableLUA|ConsentPromptBehaviorAdmin|ConsentPromptBehaviorUser|PromptOnSecureDesktop|FeatureSettingsOverride|FeatureSettingsOverrideMask|EnableVirtualizationBasedSecurity|HypervisorEnforcedCodeIntegrity|DisableAntiSpyware|DisableRealtimeMonitoring|SmartScreenEnabled|EnableSmartScreen|NoAutoUpdate|AUOptions|DisableWindowsUpdateAccess|EnableFirewall|DisableSR|DisableConfig)$/i
  const PROTECTED_PATHS = /(Windows Defender|Microsoft Antimalware|WindowsFirewall|FirewallPolicy|DeviceGuard|WindowsUpdate|SystemRestore|\\Lsa$|SecurityHealth)/i
  const PROTECTED_TASKS = /\\Microsoft\\Windows\\(Windows Defender|WindowsUpdate|UpdateOrchestrator|WaaSMedic|SystemRestore)\\/i

  it('changes no security service', () => {
    const bad = actions.filter(({ a }) => a.type === 'service' && PROTECTED_SERVICES.test(a.name))
    expect(bad.map((x) => x.id)).toEqual([])
  })

  it('writes no UAC, mitigation, VBS, Defender, SmartScreen, Update or firewall registry value', () => {
    const bad = actions.filter(({ a }) => a.type === 'registry' && (PROTECTED_VALUES.test(a.name) || PROTECTED_PATHS.test(a.path)))
    expect(bad.map((x) => x.id)).toEqual([])
  })

  it('disables no Defender, Update or System Restore task', () => {
    const bad = actions.filter(({ a }) => a.type === 'scheduledTask' && PROTECTED_TASKS.test(a.path))
    expect(bad.map((x) => x.id)).toEqual([])
  })

  it('runs no command that mentions Defender, firewall, UAC, BCD or update settings', () => {
    const bad = actions.filter(({ a }) => a.type === 'command' && /(MpPreference|Defender|netsh\s+advfirewall|NetFirewall|bcdedit|EnableLUA|wuauserv|UsoSvc)/i.test(`${a.apply} ${a.revert}`))
    expect(bad.map((x) => x.id)).toEqual([])
  })
})
