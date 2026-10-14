// In-browser stand-in for window.redline (npm run dev:web). Same contract as the
// Electron API, realistic data for this PC, short artificial delays. Never shipped
// to Electron at runtime (lazy chunk, only loaded when window.redline is missing).
import type { RedlineApi, Result, TaskProgress } from '@shared/api'
import type { ApplyItemResult, ApplyReport, AppxState, BackupEntry, GameProfile, RestorePointResult, TweakState } from '@shared/types'
import { createMetricsTicker } from './metrics'
import {
  MOCK_CATALOG,
  MOCK_GAMES,
  MOCK_HEALTH,
  MOCK_NOT_INSTALLED,
  MOCK_SETTINGS,
  MOCK_STATUS,
  MOCK_TWEAK_STATES,
  mockBackups,
  mockSystemInfo,
} from './data'

const ok = <T>(data: T): Result<T> => ({ ok: true, data })
const fail = <T>(code: string, message: string): Result<T> => ({ ok: false, error: { code, message } })
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const SAMPLE_NEW_GAMES = [
  'C:\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64\\VALORANT-Win64-Shipping.exe',
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Apex Legends\\r5apex.exe',
]

const isProtected = (pkg: string): boolean =>
  MOCK_CATALOG.neverRemove.some((n) => new RegExp(`^${n.package.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`, 'i').test(pkg))

export function createMockApi(): RedlineApi {
  let settings = { ...MOCK_SETTINGS }
  let states: readonly TweakState[] = MOCK_TWEAK_STATES
  let games: readonly GameProfile[] = MOCK_GAMES
  let backups: readonly BackupEntry[] = mockBackups()
  let removed: ReadonlySet<string> = MOCK_NOT_INSTALLED
  const progressListeners = new Set<(p: TaskProgress) => void>()
  const ticker = createMetricsTicker()

  const progress = (p: TaskProgress): void => progressListeners.forEach((cb) => cb(p))

  const restorePoint = (): RestorePointResult =>
    settings.dryRun
      ? { created: false, skippedRecent: false, latestCreatedAt: null, warning: 'Dry-run: no restore point was created.' }
      : { created: true, skippedRecent: false, latestCreatedAt: new Date().toISOString(), warning: '' }

  const setStates = (ids: readonly string[], state: TweakState['state']): void => {
    states = states.map((s) => (ids.includes(s.id) ? { id: s.id, state } : s))
  }

  async function runTweaks(ids: readonly string[], mode: 'apply' | 'revert'): Promise<ApplyReport> {
    const dryRun = settings.dryRun
    const results: ApplyItemResult[] = []
    for (const [i, id] of ids.entries()) {
      progress({ task: mode, message: `${mode === 'apply' ? 'Applying' : 'Reverting'} ${id}`, done: i, total: ids.length })
      await wait(180)
      const tweak = MOCK_CATALOG.tweaks.find((t) => t.id === id)
      const current = states.find((s) => s.id === id)?.state
      const changed = mode === 'apply' ? current !== 'applied' : current === 'applied' || current === 'partial'
      results.push({ tweakId: id, ok: true, changed, requiresReboot: changed && (tweak?.requiresReboot ?? false), dryRun })
    }
    progress({ task: mode, message: 'Done', done: ids.length, total: ids.length })
    let backupId: string | null = null
    if (!dryRun) setStates(ids, mode === 'apply' ? 'applied' : 'not-applied')
    if (!dryRun && mode === 'apply') {
      backupId = `b-${Date.now()}`
      const label = `${mode === 'apply' ? 'Applied' : 'Reverted'} ${ids.length} optimization${ids.length === 1 ? '' : 's'}`
      backups = [{ id: backupId, createdAt: new Date().toISOString(), tweakIds: [...ids], kind: 'tweaks', label, items: [], revertedAt: null }, ...backups]
    }
    return {
      backupId,
      restorePoint: settings.restorePointBeforeApply && mode === 'apply' ? restorePoint() : null,
      results,
      rebootRequired: results.some((r) => r.requiresReboot),
    }
  }

  return {
    getStatus: async () => ok({ ...MOCK_STATUS, dryRun: settings.dryRun }),
    getCatalog: async () => {
      await wait(120)
      return ok(MOCK_CATALOG)
    },
    scanSystem: async ({ force }) => {
      await wait(force ? 1400 : 250)
      return ok({ info: mockSystemInfo(), health: MOCK_HEALTH })
    },
    detectTweaks: async () => {
      await wait(500)
      return ok([...states])
    },
    applyTweaks: async ({ ids, mode }) => {
      const unknown = ids.find((id) => !MOCK_CATALOG.tweaks.some((t) => t.id === id))
      if (unknown !== undefined) return fail('INVALID_INPUT', `Unknown tweak id: ${unknown}`)
      return ok(await runTweaks(ids, mode))
    },
    listBackups: async () => ok([...backups]),
    revertBackup: async ({ backupId }) => {
      const entry = backups.find((b) => b.id === backupId)
      if (entry === undefined) return fail('NOT_FOUND', 'Unknown backup.')
      const report = await runTweaks(entry.tweakIds, 'revert')
      if (!settings.dryRun) backups = backups.map((b) => (b.id === backupId ? { ...b, revertedAt: new Date().toISOString() } : b))
      return ok({ ...report, backupId })
    },
    createRestorePoint: async () => {
      await wait(1500)
      return ok(restorePoint())
    },
    listAppx: async () => {
      await wait(400)
      return ok(MOCK_CATALOG.appx.map((a): AppxState => ({ ...a, installed: !removed.has(a.package) })))
    },
    removeAppx: async ({ packages }) => {
      const bad = packages.find((p) => isProtected(p) || !MOCK_CATALOG.appx.some((a) => a.package === p))
      if (bad !== undefined) return fail('INVALID_INPUT', `Not removable: ${bad}`)
      await wait(300 * packages.length)
      if (!settings.dryRun) removed = new Set([...removed, ...packages])
      return ok({ removed: [...packages], failed: [], dryRun: settings.dryRun })
    },
    listGames: async () => ok([...games]),
    addGame: async () => {
      const exePath = SAMPLE_NEW_GAMES.find((p) => !games.some((g) => g.exePath === p))
      if (exePath === undefined) return ok(null)
      const game: GameProfile = {
        id: `g-${Date.now()}`,
        exePath,
        exeName: exePath.split('\\').at(-1) ?? exePath,
        gpuHighPerformance: false,
        disableFullscreenOptimizations: false,
        highCpuPriority: false,
      }
      games = [...games, game]
      return ok(game)
    },
    updateGame: async (req) => {
      const current = games.find((g) => g.id === req.id)
      if (current === undefined) return fail('NOT_FOUND', 'Unknown game.')
      if (settings.dryRun) return ok(current) // dry run: nothing changes, like the real app
      const next: GameProfile = { ...current, ...req }
      games = games.map((g) => (g.id === req.id ? next : g))
      return ok(next)
    },
    removeGame: async ({ id }) => {
      if (!games.some((g) => g.id === id)) return fail('NOT_FOUND', 'Unknown game.')
      if (!settings.dryRun) games = games.filter((g) => g.id !== id)
      return ok(true as const)
    },
    getSettings: async () => ok({ ...settings }),
    setSettings: async (patch) => {
      settings = { ...settings, ...patch }
      return ok({ ...settings })
    },
    openNvidiaControlPanel: async () => ok(true as const),
    onLiveMetrics: (cb) => ticker.subscribe(cb),
    onTaskProgress: (cb) => {
      const wrapped = (p: TaskProgress): void => cb(p)
      progressListeners.add(wrapped)
      return () => {
        progressListeners.delete(wrapped)
      }
    },
  }
}
