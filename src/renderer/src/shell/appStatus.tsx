import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppStatus } from '@shared/types'
import { useApi } from '../lib/api'

export interface AppStatusValue {
  /** null until the first getStatus() answers (or when it failed). */
  status: AppStatus | null
  /** true when running in a plain browser on the mock API (npm run dev:web). */
  isMock: boolean
  /** Call after changing settings that show in the title bar (dry-run). */
  refresh: () => void
}

const AppStatusContext = createContext<AppStatusValue | null>(null)

export function AppStatusProvider({ isMock, children }: { isMock: boolean; children: ReactNode }) {
  const api = useApi()
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    api
      .getStatus()
      .then((result) => {
        if (!cancelled) setStatus(result.ok ? result.data : null)
      })
      .catch(() => {
        if (!cancelled) setStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [api, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  const value = useMemo(() => ({ status, isMock, refresh }), [status, isMock, refresh])
  return <AppStatusContext.Provider value={value}>{children}</AppStatusContext.Provider>
}

export function useAppStatus(): AppStatusValue {
  const value = useContext(AppStatusContext)
  if (value === null) throw new Error('useAppStatus must be used inside <AppStatusProvider>')
  return value
}
