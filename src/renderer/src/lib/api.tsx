import { createContext, useContext, type ReactNode } from 'react'
import type { RedlineApi } from '@shared/api'

const ApiContext = createContext<RedlineApi | null>(null)

export function ApiProvider({ api, children }: { api: RedlineApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}

/** The bridged window.redline API in Electron, or the mock API in a plain browser. */
export function useApi(): RedlineApi {
  const api = useContext(ApiContext)
  if (api === null) throw new Error('useApi must be used inside <ApiProvider>')
  return api
}

/** Resolves the API once at boot. The mock is a separate chunk that Electron never loads. */
export async function resolveApi(): Promise<{ api: RedlineApi; isMock: boolean }> {
  const bridged = (window as { redline?: RedlineApi }).redline
  if (bridged !== undefined) return { api: bridged, isMock: false }
  const { createMockApi } = await import('../mock')
  return { api: createMockApi(), isMock: true }
}
