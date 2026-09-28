import { AnimatePresence, m } from "motion/react"
import { useId, useState, type FormEvent } from "react"
import { transition } from "../motion/tokens"
import styles from "./Newsletter.module.css"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * "Letters from the atelier" — visible label, inline validation after first submit,
 * error announced and linked to the field. No backend yet: success is simulated.
 */
export function Newsletter() {
  const id = useId()
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [sent, setSent] = useState(false)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!EMAIL.test(email.trim())) {
      setError("Please enter a valid email address, like name@example.com.")
      return
    }
    setError("")
    setSent(true)
  }

  return (
    <section className="container section" aria-labelledby={`${id}-title`}>
      <div className={`grid ${styles.layout}`}>
        <div className={styles.copy}>
          <p className="t-label t-accent">02 / Drops</p>
          <h2 id={`${id}-title`} className="t-h1">
            New drops, <span className="t-serif">before</span> they sell out.
          </h2>
          <p className="t-soft">One email a week with new arrivals and members-only prices. No spam.</p>
        </div>

        <div className={styles.formWrap}>
          <AnimatePresence mode="wait" initial={false}>
            {sent ? (
              <m.p
                key="done"
                className={styles.done}
                role="status"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={transition.ui}
              >
                You’re in. Watch your inbox for the next drop.
              </m.p>
            ) : (
              <m.form
                key="form"
                className={styles.form}
                onSubmit={onSubmit}
                noValidate
                exit={{ opacity: 0 }}
                transition={transition.exit}
              >
                <label htmlFor={`${id}-email`} className={styles.label}>
                  Email address
                </label>
                <div className={styles.field}>
                  <input
                    id={`${id}-email`}
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (error && EMAIL.test(e.target.value.trim())) setError("")
                    }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : `${id}-hint`}
                    className={styles.input}
                  />
                  <button type="submit" className={styles.submit}>
                    Subscribe
                  </button>
                </div>
                {error ? (
                  <p id={`${id}-error`} className={styles.error} role="alert">
                    {error}
                  </p>
                ) : (
                  <p id={`${id}-hint`} className="t-small t-soft">
                    Unsubscribe any time. We never share your address.
                  </p>
                )}
              </m.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}
