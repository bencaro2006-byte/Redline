import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import './modal.css'

export interface ModalProps {
  open: boolean
  title: ReactNode
  onClose: () => void
  /** Optional supporting text under the title (used as aria-describedby). */
  description?: ReactNode
  /** Footer buttons, right-aligned. */
  actions?: ReactNode
  /** Block Esc / backdrop / close button while a task runs. */
  dismissible?: boolean
  size?: 'sm' | 'md' | 'lg'
  children?: ReactNode
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)
}

/** Accessible dialog: portal, focus trap, Esc to close, focus restored on close. */
export function Modal({ open, title, onClose, description, actions, dismissible = true, size = 'md', children }: ModalProps) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)

  useEffect(() => {
    onCloseRef.current = onClose
    dismissibleRef.current = dismissible
  })

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    if (panel) (focusableIn(panel)[0] ?? panel).focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && dismissibleRef.current) {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const items = focusableIn(panelRef.current)
      const first = items[0]
      const last = items.at(-1)
      if (!first || !last) {
        event.preventDefault()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previous?.focus()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div
      className="rl-modal__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={`rl-modal rl-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description !== undefined ? descId : undefined}
        tabIndex={-1}
      >
        <header className="rl-modal__header">
          <h2 id={titleId} className="rl-modal__title">
            {title}
          </h2>
          {dismissible && (
            <button type="button" className="rl-modal__close" aria-label="Close" onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </header>
        {description !== undefined && (
          <p id={descId} className="rl-modal__description">
            {description}
          </p>
        )}
        {children !== undefined && <div className="rl-modal__body">{children}</div>}
        {actions !== undefined && <footer className="rl-modal__actions">{actions}</footer>}
      </div>
    </div>,
    document.body,
  )
}
