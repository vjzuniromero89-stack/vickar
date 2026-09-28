import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useId, useState, type ReactNode } from "react"
import { ease } from "../../motion/tokens"
import { Icon } from "./Icon"
import styles from "./Accordion.module.css"

/** Disclosure row. Height animates to "auto" so long content never clips. */
export function AccordionItem({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  const reduced = useReducedMotion()

  return (
    <div className={styles.item}>
      <h3>
        <button
          type="button"
          className={styles.trigger}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((o) => !o)}
        >
          {title}
          <span className={styles.icon} data-open={open} aria-hidden="true">
            <Icon name="plus" size={18} />
          </span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            id={`${id}-panel`}
            className={styles.panel}
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: ease.out }}
          >
            <div className={styles.content}>{children}</div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
