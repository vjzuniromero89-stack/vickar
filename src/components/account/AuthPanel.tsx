import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useId, useState, type FormEvent } from "react"
import { spring, transition } from "../../motion/tokens"
import { useSession } from "../../state/SessionContext"
import styles from "./AuthPanel.module.css"

type Mode = "signin" | "signup" | "reset"

type AuthPanelProps = {
  title?: string
  subtitle?: string
  initialMode?: Mode
}

/**
 * Sign in / create account / forgot password — one panel, three states.
 * Used by the account page and as the checkout gate (the bag is kept while signing in).
 */
export function AuthPanel({ title, subtitle, initialMode = "signin" }: AuthPanelProps) {
  const { signIn, signUp, sendReset } = useSession()
  const reduced = useReducedMotion()
  const uid = useId()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const switchTo = (next: Mode) => {
    setMode(next)
    setError(null)
    setInfo(null)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    const mail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return setError("Enter a valid email, like name@example.com.")
    if (mode === "signup" && !name.trim()) return setError("Tell us your name.")
    if (mode !== "reset" && password.length < 8) return setError("Use a password with at least 8 characters.")

    setBusy(true)
    const res =
      mode === "signin" ? await signIn(mail, password) : mode === "signup" ? await signUp(name.trim(), mail, password) : await sendReset(mail)
    setBusy(false)

    if (res.error) return setError(res.error)
    if (mode === "signup" && res.needsConfirmation) {
      setInfo(`Almost there — we sent a confirmation link to ${mail}. Open it to activate your account (check spam too).`)
    } else if (mode === "reset") {
      setInfo(`If an account exists for ${mail}, a reset link is on its way.`)
    }
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: "signin", label: "Sign in" },
    { id: "signup", label: "Create account" },
  ]

  return (
    <div className={styles.panel}>
      {(title || subtitle) && (
        <div className={styles.head}>
          {title && <h2 className="t-h2">{title}</h2>}
          {subtitle && <p className="t-soft">{subtitle}</p>}
        </div>
      )}

      {mode !== "reset" && (
        <div className={styles.tabs} role="tablist" aria-label="Account">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={mode === t.id}
              className={styles.tab}
              onClick={() => switchTo(t.id)}
            >
              {mode === t.id && <m.span layoutId={`${uid}-tab`} className={styles.tabPill} transition={spring.snap} />}
              <span className={styles.tabLabel}>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <AnimatePresence initial={false} mode="popLayout">
          {mode === "signup" && (
            <m.div
              key="name"
              className={styles.field}
              initial={reduced ? { opacity: 0 } : { opacity: 0, transform: "translateY(-6px)" }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0, transition: transition.exit }}
              transition={transition.ui}
            >
              <label htmlFor={`${uid}-name`}>Full name</label>
              <input id={`${uid}-name`} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </m.div>
          )}
        </AnimatePresence>

        <div className={styles.field}>
          <label htmlFor={`${uid}-email`}>Email</label>
          <input
            id={`${uid}-email`}
            type="email"
            inputMode="email"
            autoComplete={mode === "signup" ? "email" : "username"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {mode !== "reset" && (
          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label htmlFor={`${uid}-password`}>Password</label>
              {mode === "signin" && (
                <button type="button" className={styles.link} onClick={() => switchTo("reset")}>
                  Forgot password?
                </button>
              )}
            </div>
            <input
              id={`${uid}-password`}
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={mode === "signup" ? `${uid}-pw-hint` : undefined}
            />
            {mode === "signup" && (
              <p id={`${uid}-pw-hint`} className={styles.hint}>
                At least 8 characters.
              </p>
            )}
          </div>
        )}

        <AnimatePresence>
          {error && (
            <m.p className={styles.error} role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {error}
            </m.p>
          )}
          {info && (
            <m.p className={styles.info} role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {info}
            </m.p>
          )}
        </AnimatePresence>

        <button type="submit" className={`btn btn--primary ${styles.submit}`} disabled={busy}>
          {busy ? "One moment…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </button>

        {mode === "reset" && (
          <button type="button" className={styles.link} onClick={() => switchTo("signin")}>
            ← Back to sign in
          </button>
        )}
      </form>
    </div>
  )
}
