import { m } from "motion/react"
import type { Swatch } from "../../data/catalog"
import { spring } from "../../motion/tokens"
import styles from "./Swatches.module.css"

type SwatchesProps = {
  swatches: Swatch[]
  value: string
  onChange: (hex: string) => void
  /** Unique per instance so the selection ring animates only within this group. */
  groupId: string
  label: string
  size?: "s" | "m"
}

/** Colour picker as a radio group; the selection ring glides between options (layoutId). */
export function Swatches({ swatches, value, onChange, groupId, label, size = "s" }: SwatchesProps) {
  if (swatches.length < 2) {
    return <p className="t-small t-soft">{swatches[0]?.name}</p>
  }
  return (
    <div className={styles.group} role="radiogroup" aria-label={label} data-size={size}>
      {swatches.map((s) => {
        const selected = s.hex === value
        return (
          <button
            key={s.hex}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={s.name}
            title={s.name}
            className={styles.swatch}
            onClick={() => onChange(s.hex)}
          >
            {selected && <m.span layoutId={`ring-${groupId}`} className={styles.ring} transition={spring.snap} />}
            <span className={styles.chip} style={{ background: s.hex }} />
          </button>
        )
      })}
    </div>
  )
}
