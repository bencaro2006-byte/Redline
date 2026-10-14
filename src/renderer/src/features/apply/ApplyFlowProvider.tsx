// One shared apply / revert flow for every screen: confirm (every change listed) ->
// run with live progress -> per-tweak results. Owns the single ApplyDialog instance.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TaskProgress } from '@shared/api'
import type { Tweak } from '@shared/catalog'
import type { ApplyReport } from '@shared/types'
import { useApi } from '../../lib/api'
import { useAppStatus } from '../../shell/appStatus'
import { useAppData } from '../data/AppDataProvider'
import { ApplyDialog } from './ApplyDialog'

export interface ApplyRequest {
  apply: readonly string[]
  revert: readonly string[]
}

export type FlowStage =
  | { kind: 'idle' }
  | { kind: 'confirm'; request: ApplyRequest; restorePoint: boolean }
  | { kind: 'running'; request: ApplyRequest; progress: TaskProgress | null }
  | { kind: 'done'; request: ApplyRequest; reports: ApplyReport[]; error: string | null }

export interface RequestOptions {
  /** Called once after the run finishes (not when the user cancels). */
  onFinished?: () => void
}

interface ApplyFlowApi {
  /** Opens the confirm dialog for the given tweak ids. Ignored while a run is in progress. */
  request: (req: ApplyRequest, options?: RequestOptions) => void
  busy: boolean
}

const ApplyFlowContext = createContext<ApplyFlowApi | null>(null)

export function ApplyFlowProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const { status, refresh: refreshStatus } = useAppStatus()
  const { catalog, reloadStates, rescan } = useAppData()
  const [stage, setStage] = useState<FlowStage>({ kind: 'idle' })
  const runningRef = useRef(false)
  const onFinishedRef = useRef<(() => void) | undefined>(undefined)

  const tweaksById = useMemo(() => new Map((catalog.data?.tweaks ?? []).map((t) => [t.id, t])), [catalog.data])
  const lookup = useCallback((ids: readonly string[]): Tweak[] => ids.map((id) => tweaksById.get(id)).filter((t): t is Tweak => t !== undefined), [tweaksById])

  const request = useCallback(
    (req: ApplyRequest, options?: RequestOptions) => {
      if (runningRef.current || (req.apply.length === 0 && req.revert.length === 0)) return
      onFinishedRef.current = options?.onFinished
      setStage({ kind: 'confirm', request: req, restorePoint: false })
      refreshStatus()
      api
        .getSettings()
        .then((result) => {
          if (!result.ok) return
          setStage((prev) => (prev.kind === 'confirm' && prev.request === req ? { ...prev, restorePoint: result.data.restorePointBeforeApply } : prev))
        })
        .catch(() => undefined)
    },
    [api, refreshStatus],
  )

  // Live progress while running.
  useEffect(() => {
    if (stage.kind !== 'running') return undefined
    return api.onTaskProgress((progress) => setStage((prev) => (prev.kind === 'running' ? { ...prev, progress } : prev)))
  }, [api, stage.kind])

  const run = useCallback(async () => {
    if (stage.kind !== 'confirm' || runningRef.current) return
    const req = stage.request
    runningRef.current = true
    setStage({ kind: 'running', request: req, progress: null })
    const reports: ApplyReport[] = []
    let error: string | null = null
    try {
      for (const [mode, ids] of [['apply', req.apply], ['revert', req.revert]] as const) {
        if (ids.length === 0) continue
        const result = await api.applyTweaks({ ids: [...ids], mode })
        if (result.ok) reports.push(result.data)
        else {
          error = result.error.message
          break
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      runningRef.current = false
    }
    setStage({ kind: 'done', request: req, reports, error })
    reloadStates()
    rescan(false)
    const onFinished = onFinishedRef.current
    onFinishedRef.current = undefined
    onFinished?.()
  }, [api, stage, reloadStates, rescan])

  const close = useCallback(() => {
    if (!runningRef.current) setStage({ kind: 'idle' })
  }, [])

  const value = useMemo<ApplyFlowApi>(() => ({ request, busy: stage.kind === 'running' }), [request, stage.kind])

  return (
    <ApplyFlowContext.Provider value={value}>
      {children}
      <ApplyDialog stage={stage} status={status} lookup={lookup} onConfirm={() => void run()} onClose={close} />
    </ApplyFlowContext.Provider>
  )
}

export function useApplyFlow(): ApplyFlowApi {
  const value = useContext(ApplyFlowContext)
  if (value === null) throw new Error('useApplyFlow must be used inside <ApplyFlowProvider>')
  return value
}
