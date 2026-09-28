import styles from "./Perks.module.css"

const perks = [
  "Free shipping over $75",
  "30-day returns",
  "2-year warranty",
  "Secure checkout",
  "Carbon-neutral delivery",
  "Real humans on support",
]

/**
 * Trust strip: an endless marquee (CSS, compositor-only), paused on hover and for reduced motion.
 * The list is rendered once for assistive tech; the visual duplicate is aria-hidden.
 */
export function Perks() {
  return (
    <section className={styles.perks} aria-label="Why shop with VICKAR">
      <div className={styles.track}>
        <ul className={styles.row}>
          {perks.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <ul className={styles.row} aria-hidden="true">
          {perks.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
