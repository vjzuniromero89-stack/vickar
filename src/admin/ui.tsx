import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import { useFocusTrap } from "../hooks/useFocusTrap"
import { spring, transition } from "../motion/tokens"
import styles from "./admin.module.css"

/* ---------------------------------- Toasts ---------------------------------- */

type Toast = { id: number; text: string; tone: "ok" | "error" }
const ToastContext = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {})

/** Short confirmations ("Product saved") announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const reduced = useReducedMotion()
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, tone }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3000)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className={styles.toasts} role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <m.div
              key={t.id}
              layout={!reduced}
              className={styles.toast}
              data-tone={t.tone}
              initial={reduced ? { opacity: 0 } : { opacity: 0, transform: "translateY(12px) scale(0.98)" }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px) scale(1)" }}
              exit={{ opacity: 0, transition: transition.exit }}
              transition={spring.ui}
            >
              {t.text}
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

/* ------------------------------- Confirm dialog ------------------------------ */

type ConfirmOptions = { title: string; body: string; action: string; danger?: boolean }
const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false)

/** Promise-based confirm for destructive actions — focus-trapped, Esc cancels. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), [])
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>{state && <ConfirmDialog {...state} onClose={close} />}</AnimatePresence>
    </ConfirmContext.Provider>
  )
}

function ConfirmDialog({ title, body, action, danger, onClose }: ConfirmOptions & { onClose: (v: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, true, () => onClose(false))
  return (
    <div className={styles.modalRoot}>
      <m.div className={styles.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => onClose(false)} />
      <m.div
        ref={ref}
        className={styles.modal}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        initial={{ opacity: 0, transform: "scale(0.96)" }}
        animate={{ opacity: 1, transform: "scale(1)" }}
        exit={{ opacity: 0, transform: "scale(0.98)", transition: transition.exit }}
        transition={spring.ui}
      >
        <h2 id="confirm-title" className="t-h3">
          {title}
        </h2>
        <p id="confirm-body" className="t-soft">
          {body}
        </p>
        <div className={styles.modalActions}>
          <button type="button" className="btn btn--ghost" onClick={() => onClose(false)}>
            Cancel
          </button>
          <button type="button" className={`btn ${danger ? styles.danger : "btn--primary"}`} onClick={() => onClose(true)}>
            {action}
          </button>
        </div>
      </m.div>
    </div>
  )
}

export const useConfirm = () => useContext(ConfirmContext)

/* ---------------------------------- Switch ---------------------------------- */

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={styles.switch} onClick={() => onChange(!checked)}>
      <m.span className={styles.knob} layout transition={spring.snap} data-on={checked} />
    </button>
  )
}

/* --------------------------------- Status pill ------------------------------- */

export function Pill({ tone, children }: { tone: "ok" | "warn" | "muted" | "info" | "error"; children: ReactNode }) {
  return (
    <span className={styles.pill} data-tone={tone}>
      {children}
    </span>
  )
}
