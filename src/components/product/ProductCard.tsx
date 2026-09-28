import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useState } from "react"
import { formatPrice, type Product } from "../../data/catalog"
import { useCatalog } from "../../state/CatalogContext"
import { spring, transition } from "../../motion/tokens"
import { useBag } from "../../state/BagContext"
import { Rating } from "../ui/Rating"
import { ProductVisual } from "./ProductVisual"
import { Swatches } from "./Swatches"
import styles from "./ProductCard.module.css"

type ProductCardProps = {
  product: Product
  onQuickView: (product: Product, color: string) => void
}

/**
 * Catalogue card.
 * - Hover / focus: blueprint "x-ray" draws over the product (vector art), photos ease in.
 * - Swatches recolour the product live.
 * - Quick add + wishlist; the tile opens Quick View with a shared-element transition.
 */
export function ProductCard({ product, onQuickView }: ProductCardProps) {
  const [color, setColor] = useState(product.swatches[0].hex)
  const [hover, setHover] = useState(false)
  const [saved, setSaved] = useState(false)
  const [added, setAdded] = useState(false)
  const reduced = useReducedMotion()
  const { add } = useBag()
  const { categoryLabel } = useCatalog()

  const soldOut = product.stock === 0
  const onAdd = () => {
    if (soldOut) return
    add(product.id, color)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1800)
  }

  return (
    <article
      className={styles.card}
      aria-labelledby={`${product.id}-name`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <div className={styles.tileWrap}>
        <button
          type="button"
          className={styles.tile}
          onClick={() => onQuickView(product, color)}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
          aria-label={`Quick view: ${product.name}`}
        >
          <m.div layoutId={`media-${product.id}`} className={styles.media} transition={spring.ui}>
            <div className={styles.zoom} data-photo={Boolean(product.image)}>
              <ProductVisual product={product} color={color} xray={hover} />
            </div>
          </m.div>
          <span className={`t-label ${styles.quickHint}`} aria-hidden="true">
            Quick view
          </span>
        </button>

        {product.badge && <span className={`t-label ${styles.badge}`}>{product.badge}</span>}

        <m.button
          type="button"
          className={styles.save}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          onClick={() => setSaved((s) => !s)}
          whileTap={reduced ? undefined : { scale: 0.85 }}
        >
          <m.svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            aria-hidden="true"
            animate={saved && !reduced ? { scale: [1, 1.25, 1] } : { scale: 1 }}
            transition={{ duration: 0.35 }}
          >
            <path
              d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"
              fill={saved ? "var(--c-accent)" : "none"}
              stroke={saved ? "var(--c-accent)" : "currentColor"}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </m.svg>
        </m.button>
      </div>

      <div className={styles.info}>
        <p className="t-label t-soft">{categoryLabel(product.category)}</p>
        <h3 id={`${product.id}-name`} className={styles.name}>
          <a href={`#/p/${product.id}`}>{product.name}</a>
        </h3>
        <Rating value={product.rating} reviews={product.reviews} className="t-soft" />
        <div className={styles.row}>
          <p className={styles.price}>
            {formatPrice(product.price)}
            {product.compareAt && (
              <s className={styles.compare}>
                <span className="sr-only">was </span>
                {formatPrice(product.compareAt)}
              </s>
            )}
          </p>
          <Swatches
            swatches={product.swatches}
            value={color}
            onChange={setColor}
            groupId={product.id}
            label={`${product.name} colour`}
          />
        </div>
        <m.button
          type="button"
          className={styles.add}
          data-added={added}
          onClick={onAdd}
          disabled={soldOut}
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={transition.micro}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span
              key={added ? "done" : "add"}
              initial={{ opacity: 0, transform: "translateY(70%)" }}
              animate={{ opacity: 1, transform: "translateY(0%)" }}
              exit={{ opacity: 0, transform: "translateY(-70%)" }}
              transition={transition.ui}
            >
              {soldOut ? "Sold out" : added ? "Added ✓" : "Add to bag"}
            </m.span>
          </AnimatePresence>
        </m.button>
      </div>
    </article>
  )
}
