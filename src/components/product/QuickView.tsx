import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useRef, useState } from "react"
import { formatPrice, type Product } from "../../data/catalog"
import { useCatalog } from "../../state/CatalogContext"
import { useFocusTrap } from "../../hooks/useFocusTrap"
import { useScrollLock } from "../../hooks/useScrollLock"
import { spring, transition } from "../../motion/tokens"
import { useBag } from "../../state/BagContext"
import { Icon } from "../ui/Icon"
import { Rating } from "../ui/Rating"
import { ProductVisual } from "./ProductVisual"
import { Swatches } from "./Swatches"
import styles from "./QuickView.module.css"

export type QuickViewState = { product: Product; color: string } | null

export function QuickView({ state, onClose }: { state: QuickViewState; onClose: () => void }) {
  return <AnimatePresence>{state && <Dialog key={state.product.id} {...state} onClose={onClose} />}</AnimatePresence>
}

/**
 * The product tile morphs from the grid into the dialog (shared layoutId), then the details
 * fade in beside it. "Blueprint view" re-draws the technical layer over the product.
 */
function Dialog({ product, color: initialColor, onClose }: { product: Product; color: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [color, setColor] = useState(initialColor)
  const [xray, setXray] = useState(false)
  const { add, open } = useBag()
  const { categoryLabel } = useCatalog()
  useFocusTrap(ref, true, onClose)
  useScrollLock(true)

  const onAdd = () => {
    add(product.id, color)
    onClose()
    window.setTimeout(open, 250)
  }

  return (
    <div className={styles.root}>
      <m.div
        className={styles.backdrop}
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: transition.exit }}
        aria-hidden="true"
      />
      <div
        ref={ref}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qv-title"
      >
        <m.div layoutId={`media-${product.id}`} className={styles.media} transition={spring.ui}>
          <div className={styles.mediaInner} data-photo={Boolean(product.image)}>
            <ProductVisual product={product} color={color} xray={xray} />
          </div>
          {!product.image && (
            <button
              type="button"
              className={`t-label ${styles.xray}`}
              aria-pressed={xray}
              onClick={() => setXray((x) => !x)}
            >
              {xray ? "Hide blueprint" : "Blueprint view"}
            </button>
          )}
        </m.div>

        <m.div
          className={styles.details}
          initial={reduced ? { opacity: 0 } : { opacity: 0, transform: "translateY(16px)" }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ ...transition.reveal, delay: 0.15 }}
        >
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close quick view">
            <Icon name="close" />
          </button>
          <p className="t-label t-accent">{categoryLabel(product.category)}</p>
          <h2 id="qv-title" className="t-h2">
            {product.name}
          </h2>
          <Rating value={product.rating} reviews={product.reviews} className="t-soft" />
          <p className={styles.price}>
            {formatPrice(product.price)}
            {product.compareAt && (
              <s className="t-soft t-small">
                <span className="sr-only">was </span>
                {formatPrice(product.compareAt)}
              </s>
            )}
          </p>
          <p className="t-soft">{product.blurb}</p>

          <div className={styles.block}>
            <p className="t-label t-soft">
              Colour · <span className={styles.colorName}>{product.swatches.find((s) => s.hex === color)?.name}</span>
            </p>
            <Swatches
              swatches={product.swatches}
              value={color}
              onChange={setColor}
              groupId={`qv-${product.id}`}
              label="Colour"
              size="m"
            />
          </div>

          <ul className={styles.specs}>
            {product.specs.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>

          <div className={styles.actions}>
            <button type="button" className="btn btn--primary" onClick={onAdd} disabled={product.stock === 0}>
              {product.stock === 0 ? "Sold out" : <>Add to bag · {formatPrice(product.price)}</>}
            </button>
          </div>
          <a className={styles.details_link} href={`#/p/${product.id}`} onClick={onClose}>
            View full details
            <Icon name="arrow" size={16} />
          </a>
          <p className="t-small t-soft">Free shipping over $75 · 30-day returns</p>
        </m.div>
      </div>
    </div>
  )
}
