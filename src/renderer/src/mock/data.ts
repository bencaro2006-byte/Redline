// Sample data for the browser preview (npm run dev:web), taken from read-only scans of
// the target PC (i7-7700, GTX 1070, 32 GB @ 2400, MX500 1 TB, B250M-DS3H F4, Windows 10
// Pro 22H2) on 2026-10-10. Never used by the Electron app.
import type { Catalog } from '@shared/catalog'
import type { AppStatus, BackupEntry, GameProfile, HealthCheck, Settings, SystemInfo, TweakState } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import sample from './sample-catalog.json'

const GIB = 1024 ** 3

export const MOCK_CATALOG = sample as Catalog

export const MOCK_STATUS: AppStatus = { elevated: true, dryRun: true, appVersion: '0.1.0 (preview)', platformOk: true }

export const MOCK_SETTINGS: Settings = { ...DEFAULT_SETTINGS }

export function mockSystemInfo(now: Date = new Date()): SystemInfo {
  return {
    scannedAt: now.toISOString(),
    computerName: 'DESKTOP-EXAMPLE',
    cpu: { name: 'Intel(R) Core(TM) i7-7700 CPU @ 3.60GHz', cores: 4, threads: 8, baseMHz: 3601, vendor: 'GenuineIntel' },
    gpus: [{ name: 'NVIDIA GeForce GTX 1070', driverVersion: '32.0.15.8253', nvidiaDriver: '582.53', vramBytes: 8 * GIB }],
    memory: {
      totalBytes: 32 * GIB,
      modules: [
        { capacityBytes: 16 * GIB, speedMTs: 2400, configuredMTs: 2400, manufacturer: 'Kingston', partNumber: 'KF3200C16D4/16GX', slot: 'ChannelA-DIMM0' },
        { capacityBytes: 16 * GIB, speedMTs: 2400, configuredMTs: 2400, manufacturer: 'Kingston', partNumber: 'KF3200C16D4/16GX', slot: 'ChannelB-DIMM0' },
      ],
    },
    disks: [{ model: 'CT1000MX500SSD1', mediaType: 'SSD', busType: 'SATA', sizeBytes: 1_000_204_886_016, isSystem: true }],
    volumes: [{ letter: 'C:', sizeBytes: 999_532_249_088, freeBytes: 85_392_158_720 }],
    board: { manufacturer: 'Gigabyte Technology Co., Ltd.', product: 'B250M-DS3H-CF' },
    bios: { version: 'F4', releaseDate: '2017-02-21' },
    os: { caption: 'Microsoft Windows 10 Pro', version: '10.0.19045', build: '19045', displayVersion: '22H2' },
    displays: [{ name: 'NVIDIA GeForce GTX 1070', width: 1920, height: 1080, refreshHz: 239 }],
    power: { activeSchemeGuid: '381b4222-f694-41f0-9685-ff5bb260df2e', activeSchemeName: 'Balanced' },
    security: { defenderRealtime: true, vbsRunning: false },
    gaming: { gameModeOn: true, gameDvrOn: false, hagsOn: true, trimEnabled: true },
  }
}

/** Mirrors buildHealthChecks() for the scan above. */
export const MOCK_HEALTH: HealthCheck[] = [
  { id: 'power-plan', status: 'fix', title: 'Power plan: Balanced', detail: 'A performance plan keeps the CPU ready instead of saving power between frames.', tweakId: 'ultimate-performance-plan' },
  { id: 'free-space', status: 'fix', title: 'Drive C: is 91% full', detail: '80 GB free of 931 GB. Game updates and shader caches need room; free up space with Disk Cleanup or move games to another drive.' },
  { id: 'gpu-scheduling', status: 'info', title: 'GPU scheduling is on', detail: 'Hardware-accelerated GPU scheduling helps some games and not others. Compare both settings in the games you play.' },
  { id: 'memory-speed', status: 'info', title: 'Memory at 2400 MT/s', detail: "The kit is rated 3200, but B250 boards run memory at the CPU's official speed. Enabling XMP won't raise it. Nothing to fix." },
  { id: 'bios', status: 'info', title: 'BIOS F4 from 2017', detail: 'Newer BIOS releases include CPU microcode security fixes. Updating is optional; follow the motherboard maker’s instructions.' },
  { id: 'game-dvr', status: 'ok', title: 'Background recording is off', detail: 'Windows is not capturing gameplay in the background.' },
  { id: 'game-mode', status: 'ok', title: 'Game Mode is on', detail: 'Windows prioritises the game in focus.' },
  { id: 'trim', status: 'ok', title: 'SSD TRIM enabled', detail: 'CT1000MX500SSD1 keeps its write speed over time.' },
  { id: 'dual-channel', status: 'ok', title: 'Dual-channel memory', detail: '2 modules across 2 channels.' },
  { id: 'gpu-driver', status: 'ok', title: 'GPU driver 582.53', detail: 'NVIDIA GeForce GTX 1070 has an NVIDIA driver installed.' },
  { id: 'refresh-rate', status: 'ok', title: 'Display at 239 Hz', detail: '1920 × 1080 at 239 Hz.' },
  { id: 'defender', status: 'ok', title: 'Microsoft Defender protection is on', detail: 'Redline never turns off security features.' },
]

// States observed by a read-only probe of the target PC.
const APPLIED = new Set([
  'disable-hibernation',
  'disable-network-throttling',
  'hardware-accelerated-gpu-scheduling',
  'xbox-game-bar-off',
  'enhance-pointer-precision-off',
  'window-animations-off',
  'ssd-trim-on',
  'disable-activity-history',
  'disable-language-list-sharing',
  'disable-inking-typing-personalization',
  'disable-online-speech-recognition',
])
const PARTIAL: Readonly<Record<string, string>> = {
  'keyboard-repeat-fast': '1 of 2 changes are in place.',
  'accessibility-hotkeys-off': '1 of 3 changes are in place.',
  'visual-effects-performance': '5 of 6 changes are in place.',
  'disable-feedback-prompts': '1 of 5 changes are in place.',
  'maps-broker-manual': '1 of 3 changes are in place.',
}

export const MOCK_TWEAK_STATES: TweakState[] = MOCK_CATALOG.tweaks.map((t): TweakState => {
  if (APPLIED.has(t.id)) return { id: t.id, state: 'applied' }
  const partial = PARTIAL[t.id]
  if (partial !== undefined) return { id: t.id, state: 'partial', detail: partial }
  return { id: t.id, state: 'not-applied' }
})

/** Catalog apps installed on the target PC (Get-Appx.ps1, read-only). */
const INSTALLED: ReadonlySet<string> = new Set([
  'Microsoft.BingWeather',
  'Microsoft.GetHelp',
  'Microsoft.MicrosoftOfficeHub',
  'Microsoft.MicrosoftSolitaireCollection',
  'Microsoft.MixedReality.Portal',
  'microsoft.windowscommunicationsapps',
  'Microsoft.WindowsFeedbackHub',
  'Microsoft.YourPhone',
  'Microsoft.ZuneMusic',
  'Microsoft.ZuneVideo',
  'Microsoft.WindowsSoundRecorder',
  'Microsoft.Copilot',
  'Microsoft.XboxGamingOverlay',
  'Microsoft.XboxSpeechToTextOverlay',
])

/** Catalog apps that are not installed on the target PC. */
export const MOCK_NOT_INSTALLED: ReadonlySet<string> = new Set(MOCK_CATALOG.appx.map((a) => a.package).filter((p) => !INSTALLED.has(p)))

export const MOCK_GAMES: GameProfile[] = [
  {
    id: 'g-cs2',
    exePath: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe',
    exeName: 'cs2.exe',
    gpuHighPerformance: true,
    disableFullscreenOptimizations: false,
    highCpuPriority: false,
  },
]

export function mockBackups(now: Date = new Date()): BackupEntry[] {
  const at = (hoursAgo: number): string => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString()
  return [
    {
      id: 'b-20261009-1402',
      createdAt: at(3),
      tweakIds: ['menu-show-delay-short'],
      kind: 'tweaks',
      label: 'Applied: Shorter Menu Delay',
      revertedAt: null,
      items: [
        {
          key: 'menu-show-delay-short#0',
          action: { type: 'registry', hive: 'HKCU', path: 'Control Panel\\Desktop', name: 'MenuShowDelay', valueType: 'REG_SZ', value: '100', default: '400' },
          before: { kind: 'registry', exists: true, valueType: 'REG_SZ', value: '200' },
        },
      ],
    },
    {
      id: 'b-20261007-2010',
      createdAt: at(50),
      tweakIds: ['game-g-cs2'],
      kind: 'game',
      label: 'cs2.exe: High-performance GPU',
      revertedAt: null,
      items: [
        {
          key: 'game-g-cs2-gpuHighPerformance#0',
          action: {
            type: 'registry',
            hive: 'HKCU',
            path: 'Software\\Microsoft\\DirectX\\UserGpuPreferences',
            name: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe',
            valueType: 'REG_SZ',
            value: 'GpuPreference=2;',
            default: null,
          },
          before: { kind: 'registry', exists: false, valueType: null, value: null },
        },
      ],
    },
  ]
}
