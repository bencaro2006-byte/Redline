import { describe, expect, it } from 'vitest'
import { InvokeDataSchema, ProbeDataSchema, SnapshotSchema } from './schemas'

// Trimmed, real output of Get-TweakState.ps1 on the target PC (read-only run, 2026-10-10).
const PROBE_FIXTURE = {
  results: [
    { key: 'ultimate-performance-plan#0', snapshot: { activeGuid: '381b4222-f694-41f0-9685-ff5bb260df2e', activeName: 'Balanced', isUltimate: false, kind: 'powerScheme' } },
    { key: 'processor-min-state-100#0', snapshot: { dc: 5, schemeGuid: '381b4222-f694-41f0-9685-ff5bb260df2e', ac: 5, exists: true, kind: 'powercfg' } },
    { key: 'disable-power-throttling#0', snapshot: { valueType: null, value: null, exists: false, kind: 'registry' } },
    { key: 'disable-network-throttling#0', snapshot: { valueType: 'REG_DWORD', value: 4294967295, exists: true, kind: 'registry' } },
    { key: 'visual-effects-performance#1', snapshot: { valueType: 'REG_BINARY', value: '9012038010000000', exists: true, kind: 'registry' } },
    { key: 'xbox-live-services-off#0', snapshot: { startType: 'Manual', exists: true, kind: 'service' } },
    { key: 'xbox-live-services-off#3', snapshot: { enabled: true, exists: true, kind: 'scheduledTask' } },
    { key: 'disable-hibernation#0', snapshot: { kind: 'command', detected: true } },
    { key: 'memory-compression-off#0', error: 'Access is denied. ' },
  ],
}

describe('engine schemas', () => {
  it('accepts real Get-TweakState.ps1 output', () => {
    const parsed = ProbeDataSchema.parse(PROBE_FIXTURE)
    expect(parsed.results.length).toBe(9)
    expect(parsed.results.at(-1)?.snapshot).toBeUndefined()
  })

  it('rejects malformed snapshots', () => {
    expect(SnapshotSchema.safeParse({ kind: 'registry', exists: true, valueType: 'REG_FOO', value: 1 }).success).toBe(false)
    expect(SnapshotSchema.safeParse({ kind: 'powercfg', exists: true, ac: 1, dc: 1, schemeGuid: 'not-a-guid' }).success).toBe(false)
    expect(SnapshotSchema.safeParse({ kind: 'service', exists: true, startType: 'Boot' }).success).toBe(false)
  })

  it('accepts the SCHEME_CURRENT placeholder used by default snapshots', () => {
    expect(SnapshotSchema.safeParse({ kind: 'powercfg', exists: true, ac: 5, dc: 5, schemeGuid: 'SCHEME_CURRENT' }).success).toBe(true)
  })

  it('accepts Invoke-Tweaks.ps1 results with and without createdGuid', () => {
    const data = InvokeDataSchema.parse({
      results: [
        { key: 'a#0', ok: true, changed: true, createdGuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        { key: 'b#0', ok: true, changed: false, createdGuid: null },
        { key: 'c#0', ok: false, changed: false, error: 'Access is denied.' },
      ],
    })
    expect(data.results.length).toBe(3)
  })
})
