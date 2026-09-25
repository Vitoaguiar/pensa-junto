import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useApp } from '../store/app'

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card border-2 border-dashed border-border px-8 py-10 text-center">
      <div aria-hidden className="relative h-16 w-24">
        <span className="absolute left-0 top-3 h-12 w-12 rounded-full bg-primary-soft" />
        <span className="absolute left-9 top-0 h-10 w-10 rotate-12 rounded-[10px] bg-accent-soft" />
        <span
          className="absolute bottom-0 right-0 h-0 w-0"
          style={{ borderLeft: '14px solid transparent', borderRight: '14px solid transparent', borderBottom: '24px solid var(--hint-soft)' }}
        />
      </div>
      <p className="max-w-md text-body text-ink">{title}</p>
      {children && <div className="text-support text-ink-muted">{children}</div>}
      {action}
    </div>
  )
}

/** Toasts no rodapé. Erros técnicos em vermelho só aparecem nas telas de adulto. */
export function ToastHost() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-5 z-50 flex flex-col items-center gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={[
              'pointer-events-auto flex items-center gap-3 rounded-pill px-6 py-3 text-body shadow-soft',
              t.tone === 'error'
                ? 'border-2 border-danger bg-surface text-danger'
                : t.tone === 'success'
                  ? 'bg-success-soft text-success-strong'
                  : 'bg-ink text-white'
            ].join(' ')}
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            {t.message}
            <button type="button" aria-label="Fechar aviso" className="rounded-full p-1 opacity-80 hover:opacity-100" onClick={() => dismiss(t.id)}>
              <X aria-hidden className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export interface ModalProps {
  open: boolean
  title: string
  onClose?: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

/** Modal acessível: foco preso dentro, Esc fecha, foco volta para onde estava. */
export function Modal({ open, title, onClose, children, footer, wide }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const node = panel.current
    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []
      ).filter((el) => !el.hasAttribute('disabled'))
    setTimeout(() => (focusables()[0] ?? node)?.focus(), 30)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation()
        onClose()
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      previous?.focus()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(30,34,64,0.4)] p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className={`flex max-h-[90vh] w-full flex-col rounded-card bg-surface shadow-soft ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
          >
            <header className="flex items-center justify-between gap-4 px-7 pt-6">
              <h2 className="text-[24px] font-bold text-ink">{title}</h2>
              {onClose && (
                <button
                  type="button"
                  aria-label="Fechar"
                  onClick={onClose}
                  className="flex h-12 w-12 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink"
                >
                  <X aria-hidden className="h-6 w-6" />
                </button>
              )}
            </header>
            <div className="overflow-y-auto px-7 py-5">{children}</div>
            {footer && <footer className="flex flex-wrap justify-end gap-3 border-t border-border px-7 py-5">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
