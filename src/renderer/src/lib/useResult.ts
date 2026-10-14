import { useCallback, useEffect, useRef, useState } from 'react'
import type { Result } from '@shared/api'

export type ResourceState<T> =
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: T | null; error: { code: string; message: string } }

export interface Resource<T> {
  state: ResourceState<T>
  /** Re-runs the call; keeps the previous data visible while loading. */
  reload: () => void
}

/**
 * Runs an API call that returns Result<T> on mount (and on reload) and tracks
 * loading / ready / error. `call` should be stable (module function or useCallback).
 */
export function useResult<T>(call: () => Promise<Result<T>>): Resource<T> {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading', data: null, error: null })
  const [nonce, setNonce] = useState(0)
  const latest = useRef(0)

  useEffect(() => {
    const ticket = latest.current + 1
    latest.current = ticket
    setState((prev) => ({ status: 'loading', data: prev.data, error: null }))
    call()
      .then((result) => {
        if (latest.current !== ticket) return
        setState((prev) => (result.ok ? { status: 'ready', data: result.data, error: null } : { status: 'error', data: prev.data, error: result.error }))
      })
      .catch((err: unknown) => {
        if (latest.current !== ticket) return
        const message = err instanceof Error ? err.message : String(err)
        setState((prev) => ({ status: 'error', data: prev.data, error: { code: 'FAILED', message } }))
      })
  }, [call, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { state, reload }
}
