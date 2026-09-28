import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useRef } from "react"
import { formatPrice } from "../../data/catalog"
import { useCatalog } from "../../state/CatalogContext"
import { useFocusTrap } from "../../hooks/useFocusTrap"
import { useScrollLock } from "../../hooks/useScrollLock"
import { spring, transition } from "../../motion/tokens"
import { useBag } from "../../state/BagContext"
import { ProductVisual } from "../product/ProductVisual"
import { Icon } from "../ui/Icon"
import styles from "./BagDrawer.module.css"

const FREE_SHIPPING = 75

export function BagDrawer() {
  const { isOpen, close } = useBag()
  return <AnimatePresence>{isOpen && <Drawer onClose={close} />}</AnimatePresence>
}

function Drawer({ onClose }: { onClose: () => void }) {
  const { lines, subtotal, setQty, remove, add } = useBag()
  const { published } = useCatalog()
  const ref = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  useFocusTrap(ref, true, onClose)
  useScrollLock(true)

  const remaining = Math.max(0, FREE_SHIPPING - subtotal)
  const progress = Math.min(1, subtotal / FREE_SHIPPING)
  const suggestions = published.filter((p) => !lines.some((l) => l.productId === p.id)).slice(0, 2)

  return (
    <>
      <m.div
        className={styles.backdrop}
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: transition.exit }}
        transition={transition.ui}
        aria-hidden="true"
      />
      <m.aside
        ref={ref}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bag-title"
        initial={reduced ? { opacity: 0 } : { transform: "translateX(100%)" }}
        animate={reduced ? { opacity: 1 } : { transform: "translateX(0%)" }}
        exit={reduced ? { opacity: 0 } : { transform: "translateX(100%)", transition: transition.exit }}
        transition={spring.ui}
      >
        <header className={styles.head}>
          <h2 id="bag-title" className="t-h3">
            Your bag <span className="t-soft">({lines.reduce((n, l) => n + l.qty, 0)})</span>
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close bag">
            <Icon name="close" />
          </button>
        </header>

        <div className={styles.shipping}>
          <p className="t-small">
            {remaining > 0 ? <>Add {formatPrice(remaining)} for free shipping</> : <>You've unlocked free shipping</>}
          </p>
          <div className={styles.track} aria-hidden="true">
            <m.span
              className={styles.fill}
              initial={false}
              animate={{ transform: `scaleX(${progress})` }}
              transition={spring.ui}
            />
          </div>
        </div>

        <div className={styles.body}>
          {lines.length === 0 ? (
            <div className={styles.empty}>
              <p className="t-h3">Your bag is empty.</p>
              <p className="t-soft t-small">Start with a bestseller.</p>
            </div>
          ) : (
            <ul className={styles.lines}>
              <AnimatePresence initial={false}>
                {lines.map((l) => (
                  <m.li
                    key={l.key}
                    className={styles.line}
                    layout={!reduced}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: transition.exit }}
                  >
                    <div className={styles.thumb} data-photo={Boolean(l.product.image)}>
                      <ProductVisual product={l.product} color={l.color} />
                    </div>
                    <div className={styles.lineInfo}>
                      <p className={styles.lineName}>{l.product.name}</p>
                      <p className="t-label t-soft">{l.colorName}</p>
                      <div className={styles.lineActions}>
                        <div className={styles.qty} role="group" aria-label={`Quantity for ${l.product.name}`}>
                          <button type="button" onClick={() => setQty(l.key, l.qty - 1)} aria-label="Decrease quantity">
                            <Icon name="minus" size={16} />
                          </button>
                          <span>{l.qty}</span>
                          <button type="button" onClick={() => setQty(l.key, l.qty + 1)} aria-label="Increase quantity">
                            <Icon name="plus" size={16} />
                          </button>
                        </div>
                        <button type="button" className={styles.remove} onClick={() => remove(l.key)}>
                          Remove
                        </button>
                      </div>
                    </div>
                    <p className={styles.linePrice}>{formatPrice(l.product.price * l.qty)}</p>
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          )}

          {suggestions.length > 0 && (
            <div className={styles.suggestion}>
              <p className="t-label t-soft">You may also like</p>
              {suggestions.map((s) => (
                <div key={s.id} className={styles.suggestionCard}>
                  <div className={styles.thumb}>
                    <ProductVisual product={s} color={s.swatches[0].hex} />
                  </div>
                  <div>
                    <p className={styles.lineName}>{s.name}</p>
                    <p className="t-small t-soft">{formatPrice(s.price)}</p>
                  </div>
                  <button
                    type="button"
                    className={styles.quickAdd}
                    onClick={() => add(s.id, s.swatches[0].hex)}
                    aria-label={`Add ${s.name} to bag`}
                  >
                    <Icon name="plus" size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <footer className={styles.foot}>
            <div className={styles.subtotal}>
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <p className="t-small t-soft">Taxes and shipping calculated at checkout.</p>
            <a className="btn btn--primary" href="#/checkout" onClick={onClose}>
              Checkout
              <Icon name="arrow" size={18} />
            </a>
          </footer>
        )}
      </m.aside>
    </>
  )
}
