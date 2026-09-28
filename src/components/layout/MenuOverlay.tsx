import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useRef, useState } from "react"
import { useFocusTrap } from "../../hooks/useFocusTrap"
import { useScrollLock } from "../../hooks/useScrollLock"
import { duration, ease, stagger } from "../../motion/tokens"
import { useShop } from "../../state/ShopContext"
import { useCatalog } from "../../state/CatalogContext"
import { ProductArt } from "../product/ProductArt"
import styles from "./MenuOverlay.module.css"

type MenuOverlayProps = { open: boolean; onClose: () => void; onSearch: () => void }

export function MenuOverlay({ open, onClose, onSearch }: MenuOverlayProps) {
  return <AnimatePresence>{open && <Panel onClose={onClose} onSearch={onSearch} />}</AnimatePresence>
}

/** Full-screen menu: categories rise in; the focused category is drawn as a live blueprint preview. */
function Panel({ onClose, onSearch }: { onClose: () => void; onSearch: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const { shop } = useShop()
  const { categories: all, published: products } = useCatalog()
  const categories = all.filter((c) => products.some((p) => p.category === c.id))
  const [active, setActive] = useState(0)
  useFocusTrap(ref, true, onClose)
  useScrollLock(true)

  const go = (id: Parameters<typeof shop>[0]) => {
    onClose()
    shop(id)
  }

  const cat = categories[Math.min(active, categories.length - 1)]
  const color = products.find((p) => p.category === cat?.id)?.swatches[0]?.hex ?? "#ff7a45"

  return (
    <m.div
      ref={ref}
      id="site-menu"
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      initial={reduced ? { opacity: 0 } : { clipPath: "inset(0% 0% 100% 0%)" }}
      animate={reduced ? { opacity: 1 } : { clipPath: "inset(0% 0% 0% 0%)" }}
      exit={reduced ? { opacity: 0 } : { clipPath: "inset(0% 0% 100% 0%)", transition: { duration: 0.4, ease: ease.exit } }}
      transition={{ duration: 0.6, ease: ease.out }}
    >
      <div className={`container ${styles.inner}`}>
        <m.ul
          className={styles.list}
          initial="hidden"
          animate="shown"
          transition={{ staggerChildren: stagger.items, delayChildren: 0.2 }}
        >
          {categories.map((c, i) => (
            <m.li
              key={c.id}
              variants={{
                hidden: reduced ? { opacity: 0 } : { opacity: 0, transform: "translateY(30%)" },
                shown: reduced ? { opacity: 1 } : { opacity: 1, transform: "translateY(0%)" },
              }}
              transition={{ duration: duration.reveal, ease: ease.out }}
            >
              <button
                type="button"
                className={styles.link}
                data-active={active === i}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => go(c.id)}
              >
                <span className={`t-label ${styles.num}`}>{String(i + 1).padStart(2, "0")}</span>
                <span className={styles.label}>{c.label}</span>
              </button>
            </m.li>
          ))}
        </m.ul>

        {cat && (
        <div className={styles.preview} aria-hidden="true">
          <div className={styles.previewGrid} />
          <AnimatePresence mode="popLayout" initial={false}>
            <m.div
              key={cat.id}
              className={styles.previewArt}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ProductArt kind={cat.art} color={color} materialize={0.35} draw />
            </m.div>
          </AnimatePresence>
          <p className={`t-label ${styles.spec}`}>{cat.spec}</p>
        </div>
        )}

        <div className={styles.foot}>
          <button type="button" className="btn btn--ghost" onClick={onSearch}>
            Search
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => go("all")}>
            Shop all products
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </m.div>
  )
}
