import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import './toast.css'

export type ToastTone = 'ok' | 'fix' | 'info' | 'error'

export interface ToastInput {
  title: string
  message?: string
  tone?: ToastTone
  /** ms before auto-dismiss; 0 keeps it until closed. Default 5000 (errors 8000). */
  durationMs?: number
}

interface ToastItem extends Required<Omit<ToastInput, 'message'>> {
  id: number
  message?: string
}

interface ToastApi {
  show(input: ToastInput): number
  dismiss(id: number): void
}

const ToastContext = createContext<ToastApi | null>(null)
const MAX_VISIBLE = 4

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<readonly ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), [])

  const show = useCallback((input: ToastInput) => {
    const id = nextId.current
    nextId.current += 1
    const tone = input.tone ?? 'info'
    const item: ToastItem = {
      id,
      title: input.title,
      message: input.message,
      tone,
      durationMs: input.durationMs ?? (tone === 'error' ? 8000 : 5000),
    }
    setItems((prev) => [...prev, item].slice(-MAX_VISIBLE))
    return id
  }, [])

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="rl-toasts" role="region" aria-label="Notifications">
        <div aria-live="polite" aria-relevant="additions" className="rl-toasts__stack">
          {items.map((item) => (
            <ToastView key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (item.durationMs <= 0) return undefined
    const timer = window.setTimeout(() => onDismiss(item.id), item.durationMs)
    return () => window.clearTimeout(timer)
  }, [item.id, item.durationMs, onDismiss])

  return (
    <div className={`rl-toast rl-toast--${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'}>
      <span className="rl-toast__bar" aria-hidden="true" />
      <div className="rl-toast__text">
        <span className="rl-toast__title">{item.title}</span>
        {item.message !== undefined && <span className="rl-toast__message">{item.message}</span>}
      </div>
      <button type="button" className="rl-toast__close" aria-label="Dismiss notification" onClick={() => onDismiss(item.id)}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (api === null) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}
