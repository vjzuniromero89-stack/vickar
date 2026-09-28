import { m, useReducedMotion } from "motion/react"
import type { ElementType } from "react"
import { duration, ease, inView, stagger } from "../../motion/tokens"
import styles from "./TextLines.module.css"

type TextLinesProps = {
  /** Explicit line breaks — art-directed, never auto-split. */
  lines: string[]
  as?: ElementType
  id?: string
  className?: string
  delay?: number
  /** Animate on mount instead of on entering the viewport (hero). */
  onMount?: boolean
}

/**
 * Headlines rise line by line from behind a mask.
 * Screen readers get the full sentence once via aria-label; the visual lines are hidden from AT.
 */
export function TextLines({ lines, as: Tag = "h2", id, className, delay = 0, onMount }: TextLinesProps) {
  const reduced = useReducedMotion()
  const trigger = onMount ? { animate: "shown" } : { whileInView: "shown", viewport: inView }

  return (
    <Tag id={id} className={className} aria-label={lines.join(" ")}>
      <m.span
        className={styles.lines}
        aria-hidden="true"
        initial="hidden"
        {...trigger}
        transition={{ staggerChildren: stagger.lines, delayChildren: delay }}
      >
        {lines.map((line, i) => (
          <span key={i} className={styles.mask}>
            <m.span
              className={styles.line}
              variants={{
                hidden: reduced ? { opacity: 0 } : { transform: "translateY(105%)" },
                shown: reduced ? { opacity: 1 } : { transform: "translateY(0%)" },
              }}
              transition={{ duration: reduced ? 0.2 : duration.reveal, ease: ease.out }}
            >
              {line}
            </m.span>
          </span>
        ))}
      </m.span>
    </Tag>
  )
}
