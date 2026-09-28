import { m, useReducedMotion } from "motion/react"
import { ease } from "../../motion/tokens"
import styles from "./Logo.module.css"

/** The VICKAR mark: a V folded from two planes — ink and ember — meeting at a crease. */
const LEFT = "M2.5 5 H10.5 L16 19.5 V28 Z"
const RIGHT = "M29.5 5 H21.5 L16 19.5 V28 Z"
const FOLD = "M21.5 5 L16 19.5 V28 L18.6 21.2 Z"

type MarkProps = { size?: number; animate?: boolean; className?: string }

/** On first paint the planes unfold into place from either side and meet at the crease. */
export function LogoMark({ size = 24, animate = true, className }: MarkProps) {
  const reduced = useReducedMotion()
  const play = animate && !reduced
  const t = { duration: 0.9, ease: ease.out }

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={`${styles.mark} ${className ?? ""}`} aria-hidden="true">
      <m.path
        d={LEFT}
        fill="currentColor"
        initial={play ? { opacity: 0, transform: "translateX(-6px)" } : false}
        animate={{ opacity: 1, transform: "translateX(0px)" }}
        transition={t}
      />
      <m.g
        className={styles.ember}
        initial={play ? { opacity: 0, transform: "translateX(6px)" } : false}
        animate={{ opacity: 1, transform: "translateX(0px)" }}
        transition={{ ...t, delay: 0.12 }}
      >
        <path d={RIGHT} fill="var(--c-accent)" />
        <path d={FOLD} fill="#000" opacity="0.22" />
      </m.g>
    </svg>
  )
}

/** Mark + wordmark lockup. */
export function Logo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span className={`${styles.logo} ${className ?? ""}`}>
      <LogoMark size={size} />
      <span className={styles.word}>VICKAR</span>
    </span>
  )
}
