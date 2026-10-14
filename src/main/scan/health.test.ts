import { describe, expect, it } from 'vitest'
import type { SystemInfo } from '@shared/types'
import { boardLocksMemorySpeed, buildHealthChecks, POWER_PLANS, ratedSpeedFromPartNumber } from './health'
import { isFresh } from './cache'
import { SystemInfoSchema } from './systemInfo'

// Real Get-SystemInfo.ps1 output from the target PC (2026-10-10), lightly trimmed.
const PC: SystemInfo = {
  scannedAt: '2026-10-10T15:31:10.0996880Z',
  computerName: 'DESKTOP-EXAMPLE',
  cpu: { name: 'Intel(R) Core(TM) i7-7700 CPU @ 3.60GHz', cores: 4, threads: 8, baseMHz: 3601, vendor: 'GenuineIntel' },
  gpus: [{ name: 'NVIDIA GeForce GTX 1070', driverVersion: '32.0.15.8253', nvidiaDriver: '582.53', vramBytes: 8589934592 }],
  memory: {
    totalBytes: 34359738368,
    modules: [
      { capacityBytes: 17179869184, speedMTs: 2400, configuredMTs: 2400, manufacturer: 'Kingston', partNumber: 'KF3200C16D4/16GX', slot: 'ChannelA-DIMM0' },
      { capacityBytes: 17179869184, speedMTs: 2400, configuredMTs: 2400, manufacturer: 'Kingston', partNumber: 'KF3200C16D4/16GX', slot: 'ChannelB-DIMM0' },
    ],
  },
  disks: [{ model: 'CT1000MX500SSD1', mediaType: 'SSD', busType: 'SATA', sizeBytes: 1000204886016, isSystem: true }],
  volumes: [{ letter: 'C:', sizeBytes: 999532249088, freeBytes: 85392158720 }],
  board: { manufacturer: 'Gigabyte Technology Co., Ltd.', product: 'B250M-DS3H-CF' },
  bios: { version: 'F4', releaseDate: '2017-02-21' },
  os: { caption: 'Microsoft Windows 10 Pro', version: '10.0.19045', build: '19045', displayVersion: '22H2' },
  displays: [{ name: 'NVIDIA GeForce GTX 1070', width: 1920, height: 1080, refreshHz: 239 }],
  power: { activeSchemeGuid: POWER_PLANS.balanced, activeSchemeName: 'Balanced' },
  security: { defenderRealtime: true, vbsRunning: false },
  gaming: { gameModeOn: true, gameDvrOn: false, hagsOn: true, trimEnabled: true },
}

const KNOWN = new Set(['ultimate-performance-plan', 'xbox-game-bar-off', 'ssd-trim-on'])
const byId = (checks: ReturnType<typeof buildHealthChecks>) => new Map(checks.map((c) => [c.id, c]))

describe('ratedSpeedFromPartNumber', () => {
  it('reads common part number formats', () => {
    expect(ratedSpeedFromPartNumber('KF3200C16D4/16GX')).toBe(3200)
    expect(ratedSpeedFromPartNumber('F4-3600C16-16GVKC')).toBe(3600)
    expect(ratedSpeedFromPartNumber('CMK16GX4M2B3200C16')).toBe(3200)
    expect(ratedSpeedFromPartNumber('Some DDR4-2666 stick')).toBe(2666)
    expect(ratedSpeedFromPartNumber('M378A1K43CB2-CTD')).toBeNull()
  })
})

describe('buildHealthChecks on the target PC', () => {
  const checks = buildHealthChecks(PC, KNOWN)
  const map = byId(checks)

  it('flags the Balanced plan with the Ultimate Performance tweak', () => {
    expect(map.get('power-plan')).toMatchObject({ status: 'fix', tweakId: 'ultimate-performance-plan' })
  })

  it('flags drive C: at 91% full', () => {
    expect(map.get('free-space')).toMatchObject({ status: 'fix', title: 'Drive C: is 91% full' })
  })

  it('explains the B250 memory cap instead of suggesting XMP', () => {
    expect(boardLocksMemorySpeed(PC)).toBe(true)
    const memory = map.get('memory-speed')
    expect(memory?.status).toBe('info')
    expect(memory?.detail).toMatch(/rated 3200.*B250.*won't raise it/)
  })

  it('reports dual-channel, TRIM, Defender, display and driver as ok', () => {
    expect(map.get('dual-channel')?.status).toBe('ok')
    expect(map.get('trim')?.status).toBe('ok')
    expect(map.get('defender')?.status).toBe('ok')
    expect(map.get('refresh-rate')).toMatchObject({ status: 'ok', title: 'Display at 239 Hz' })
    expect(map.get('gpu-driver')).toMatchObject({ status: 'ok', title: 'GPU driver 582.53' })
  })

  it('mentions the 2017 BIOS as information only', () => {
    expect(map.get('bios')).toMatchObject({ status: 'info', title: 'BIOS F4 from 2017' })
  })

  it('sorts fix before info before ok', () => {
    const order = checks.map((c) => c.status)
    expect(order).toEqual([...order].sort((a, b) => ['fix', 'info', 'ok'].indexOf(a) - ['fix', 'info', 'ok'].indexOf(b)))
  })

  it('validates against the SystemInfo schema', () => {
    expect(SystemInfoSchema.safeParse(PC).success).toBe(true)
  })
})

describe('buildHealthChecks edge cases', () => {
  it('omits tweak ids that are not in the catalog', () => {
    expect(byId(buildHealthChecks(PC)).get('power-plan')?.tweakId).toBeUndefined()
  })

  it('suggests XMP on boards that allow memory overclocking', () => {
    const z270 = { ...PC, board: { ...PC.board, product: 'Z270-GAMING K3' } }
    expect(byId(buildHealthChecks(z270)).get('memory-speed')?.detail).toMatch(/XMP/)
  })

  it('handles a single module, Game DVR on, TRIM off, Defender off and a 60 Hz display', () => {
    const [first] = PC.memory.modules
    const other: SystemInfo = {
      ...PC,
      memory: { totalBytes: 17179869184, modules: first ? [first] : [] },
      gaming: { gameModeOn: false, gameDvrOn: true, hagsOn: null, trimEnabled: false },
      security: { defenderRealtime: false, vbsRunning: null },
      displays: [{ name: 'x', width: 1920, height: 1080, refreshHz: 60 }],
      volumes: [{ letter: 'C:', sizeBytes: 1000, freeBytes: 500 }],
      power: { activeSchemeGuid: POWER_PLANS.highPerformance, activeSchemeName: 'High performance' },
    }
    const map = byId(buildHealthChecks(other, KNOWN))
    expect(map.get('dual-channel')?.status).toBe('info')
    expect(map.get('game-dvr')).toMatchObject({ status: 'fix', tweakId: 'xbox-game-bar-off' })
    expect(map.get('game-mode')?.status).toBe('info')
    expect(map.get('trim')).toMatchObject({ status: 'fix', tweakId: 'ssd-trim-on' })
    expect(map.get('defender')?.status).toBe('info')
    expect(map.get('refresh-rate')?.status).toBe('info')
    expect(map.get('free-space')?.status).toBe('ok')
    expect(map.get('power-plan')?.status).toBe('ok')
    expect(map.has('gpu-scheduling')).toBe(false)
  })
})

describe('isFresh', () => {
  it('accepts recent scans and rejects old, future or invalid timestamps', () => {
    const now = Date.parse('2026-10-10T12:00:00Z')
    expect(isFresh('2026-10-10T11:00:00Z', 6 * 3600e3, now)).toBe(true)
    expect(isFresh('2026-10-10T05:00:00Z', 6 * 3600e3, now)).toBe(false)
    expect(isFresh('2026-10-10T13:00:00Z', 6 * 3600e3, now)).toBe(false)
    expect(isFresh('garbage', 6 * 3600e3, now)).toBe(false)
  })
})
