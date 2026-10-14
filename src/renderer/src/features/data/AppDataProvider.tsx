// Shared app data: catalog, detected tweak states and the system scan, loaded once and
// shared by every screen so PowerShell probes are not repeated per screen.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { ScanResult } from '@shared/api'
import type { Catalog } from '@shared/catalog'
import type { TweakState } from '@shared/types'
import { useApi } from '../../lib/api'
import { useResult, type ResourceState } from '../../lib/useResult'

export interface AppData {
  catalog: ResourceState<Catalog>
  states: ResourceState<TweakState[]>
  scan: ResourceState<ScanResult>
  stateById: ReadonlyMap<string, TweakState>
  /** Re-detects tweak states (after apply / revert). */
  reloadStates: () => void
  /** Re-reads the scan; force re-runs the full hardware scan. */
  rescan: (force: boolean) => void
  /** true while a forced rescan is running. */
  rescanning: boolean
}

const AppDataContext = createContext<AppData | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const [forceScan, setForceScan] = useState(false)

  const loadCatalog = useCallback(() => api.getCatalog(), [api])
  const loadStates = useCallback(() => api.detectTweaks(), [api])
  const loadScan = useCallback(() => api.scanSystem({ force: forceScan }), [api, forceScan])

  const catalog = useResult(loadCatalog)
  const states = useResult(loadStates)
  const scan = useResult(loadScan)

  const stateById = useMemo(() => new Map((states.state.data ?? []).map((s) => [s.id, s])), [states.state.data])

  const { reload: reloadStates } = states
  const { reload: reloadScan } = scan
  const rescan = useCallback(
    (force: boolean) => {
      if (force !== forceScan) setForceScan(force)
      else reloadScan()
    },
    [forceScan, reloadScan],
  )

  const value = useMemo<AppData>(
    () => ({
      catalog: catalog.state,
      states: states.state,
      scan: scan.state,
      stateById,
      reloadStates,
      rescan,
      rescanning: forceScan && scan.state.status === 'loading',
    }),
    [catalog.state, states.state, scan.state, stateById, reloadStates, rescan, forceScan],
  )
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData(): AppData {
  const value = useContext(AppDataContext)
  if (value === null) throw new Error('useAppData must be used inside <AppDataProvider>')
  return value
}
