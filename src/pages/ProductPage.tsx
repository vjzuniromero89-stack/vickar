import { AnimatePresence, animate, m, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { ProductArt } from "../components/product/ProductArt"
import { ProductCard } from "../components/product/ProductCard"
import { Swatches } from "../components/product/Swatches"
import { AccordionItem } from "../components/ui/Accordion"
import { Icon } from "../components/ui/Icon"
import { Rating } from "../components/ui/Rating"
import { formatPrice, type ArtKind, type Product } from "../data/catalog"
import { useCatalog } from "../state/CatalogContext"
import { duration, ease, spring, transition } from "../motion/tokens"
import { useBag } from "../state/BagContext"
import { useRouter } from "../state/RouterContext"
import { useShop } from "../state/ShopContext"
import styles from "./ProductPage.module.css"

type View = "product" | "blueprint" | "detail"

/** Where "Detail" zooms for each kind of product. */
const detailFocus: Record<ArtKind, { origin: string; scale: number; label: string }> = {
  bottle: { origin: "50% 14%", scale: 2.2, label: "Leak-proof loop cap" },
  sport: { origin: "50% 14%", scale: 2.3, label: "Lock-flow nozzle" },
  sunglasses: { origin: "30% 50%", scale: 1.9, label: "Polarised lens" },
  watch: { origin: "50% 50%", scale: 1.8, label: "Sapphire-covered dial" },
  box: { origin: "40% 82%", scale: 2, label: "Product label" },
}

export function ProductPage({ id }: { id: string }) {
  const { published, status } = useCatalog()
  const product = published.find((p) => p.id === id)
  if (!product && status === "loading") return <div className={styles.missing} aria-busy="true" />
  const { toHome } = useRouter()

  if (!product) {
    return (
      <section className={`container ${styles.missing}`}>
        <h1 className="t-h1">We couldn't find that product.</h1>
        <p className="t-soft">It may have sold out or moved.</p>
        <button type="button" className="btn btn--primary" onClick={toHome}>
          Back to the store
        </button>
      </section>
    )
  }
  return <Detail key={product.id} product={product} />
}

function Detail({ product }: { product: Product }) {
  const { shop } = useShop()
  const { toProduct } = useRouter()
  const { add, open } = useBag()
  const reduced = useReducedMotion()
  const [color, setColor] = useState(product.swatches[0].hex)
  const [qty, setQty] = useState(1)
  const [view, setView] = useState<View>("product")
  const [added, setAdded] = useState(false)
  const buyRef = useRef<HTMLDivElement>(null)
  // The sticky bar appears once the main buy button is above the viewport. Checked on scroll
  // (not IntersectionObserver): a fast jump past the button never crosses an observer threshold.
  const [pastBuy, setPastBuy] = useState(false)
  const { scrollY } = useScroll()
  useMotionValueEvent(scrollY, "change", () => {
    const el = buyRef.current
    if (el) setPastBuy(el.getBoundingClientRect().bottom < 0)
  })
  const { published: products, categoryById } = useCatalog()
  const category = categoryById(product.category) ?? { id: product.category, label: "Products", spec: "", art: product.art, pitch: "", headline: ["", ""] as [string, string] }
  const focus = detailFocus[product.art]

  // Blueprint ↔ product: the art dematerialises / materialises instead of swapping images
  const mat = useMotionValue(1)
  useEffect(() => {
    const target = view === "blueprint" ? 0.06 : 1
    const controls = animate(mat, target, reduced ? { duration: 0 } : { duration: 0.7, ease: ease.inOut })
    return () => controls.stop()
  }, [view, mat, reduced])

  const soldOut = product.stock === 0
  const maxQty = product.stock == null ? 9 : Math.min(9, product.stock)
  const onAdd = () => {
    if (soldOut) return
    for (let i = 0; i < qty; i++) add(product.id, color)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1800)
  }

  const related = [
    ...products.filter((p) => p.category === product.category && p.id !== product.id),
    ...products.filter((p) => p.category !== product.category),
  ].slice(0, 4)

  const colorName = product.swatches.find((s) => s.hex === color)?.name

  return (
    <>
      <article className={`container ${styles.page}`} aria-labelledby="pdp-title">
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <ol>
            <li>
              <button type="button" onClick={() => shop("all")}>
                Shop
              </button>
            </li>
            <li>
              <button type="button" onClick={() => shop(product.category)}>
                {category.label}
              </button>
            </li>
            <li aria-current="page">{product.name}</li>
          </ol>
        </nav>

        <div className={styles.layout}>
          {/* Gallery */}
          <div className={styles.gallery}>
            <div className={styles.stage}>
              <div className={styles.grid} data-on={view === "blueprint"} aria-hidden="true" />
              <m.div
                className={styles.zoom}
                initial={false}
                animate={{ scale: view === "detail" ? focus.scale : 1 }}
                style={{ transformOrigin: focus.origin }}
                transition={reduced ? { duration: 0 } : { duration: duration.reveal, ease: ease.out }}
              >
                <ProductArt
                  kind={product.art}
                  color={color}
                  materialize={mat}
                  draw={view === "blueprint"}
                  blueprint="overlay"
                  label={`${product.name} in ${colorName}`}
                />
              </m.div>
              <AnimatePresence>
                {view !== "product" && (
                  <m.p
                    key={view}
                    className={`t-label ${styles.caption}`}
                    initial={{ opacity: 0, transform: "translateY(6px)" }}
                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                    exit={{ opacity: 0 }}
                    transition={transition.ui}
                  >
                    {view === "blueprint" ? category.spec : focus.label}
                  </m.p>
                )}
              </AnimatePresence>
            </div>

            <div className={styles.views} role="group" aria-label="Product view">
              {(["product", "blueprint", "detail"] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={styles.viewBtn}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                >
                  {view === v && <m.span layoutId="pdp-view" className={styles.viewPill} transition={spring.snap} />}
                  <span className={styles.viewLabel}>{v[0].toUpperCase() + v.slice(1)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Buy panel */}
          <m.div
            className={styles.info}
            initial={reduced ? { opacity: 0 } : { opacity: 0, transform: "translateY(20px)" }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
            transition={{ ...transition.reveal, delay: 0.1 }}
          >
            <p className="t-label t-accent">
              {category.label}
              {product.badge ? ` · ${product.badge}` : ""}
            </p>
            <h1 id="pdp-title" className={`t-h1 ${styles.title}`}>
              {product.name}
            </h1>
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
            {product.stock != null && product.stock > 0 && product.stock <= 5 && (
              <p className={styles.lowStock} role="status">
                Only {product.stock} left
              </p>
            )}

            <div className={styles.option}>
              <p className="t-label t-soft">
                Colour · <span className={styles.ink}>{colorName}</span>
              </p>
              <Swatches
                swatches={product.swatches}
                value={color}
                onChange={setColor}
                groupId={`pdp-${product.id}`}
                label="Colour"
                size="m"
              />
            </div>

            <div ref={buyRef} className={styles.buy}>
              <div className={styles.qty} role="group" aria-label="Quantity">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" disabled={qty <= 1}>
                  <Icon name="minus" size={16} />
                </button>
                <output aria-live="polite">{qty}</output>
                <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} aria-label="Increase quantity">
                  <Icon name="plus" size={16} />
                </button>
              </div>
              <AddButton added={added} onAdd={onAdd} price={product.price * qty} soldOut={soldOut} />
            </div>
            <button type="button" className={styles.viewBag} onClick={open}>
              View bag
            </button>

            <ul className={styles.perks}>
              <li>Free shipping over $75</li>
              <li>30-day free returns</li>
              <li>2-year warranty</li>
            </ul>

            <div className={styles.accordion}>
              <AccordionItem title="Specifications" defaultOpen>
                <ul className={styles.specs}>
                  {product.specs.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </AccordionItem>
              <AccordionItem title="Shipping & returns">
                <p>Ships in 1–2 business days. Free standard shipping over $75. Return unused items within 30 days for a full refund.</p>
              </AccordionItem>
              <AccordionItem title="Care">
                <p>Hand-wash with warm soapy water. Avoid abrasive cleaners. Dry fully before storing.</p>
              </AccordionItem>
            </div>
          </m.div>
        </div>
      </article>

      <section className={`container section ${styles.related}`} aria-labelledby="related-title">
        <p className="t-label t-accent">You may also like</p>
        <h2 id="related-title" className="t-h2">
          Complete the set
        </h2>
        <ul className={styles.relatedGrid}>
          {related.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} onQuickView={(item) => toProduct(item.id)} />
            </li>
          ))}
        </ul>
      </section>

      {/* Mobile: the buy bar follows once the main button scrolls away */}
      <AnimatePresence>
        {pastBuy && (
          <m.div
            className={styles.sticky}
            initial={{ transform: "translateY(110%)" }}
            animate={{ transform: "translateY(0%)" }}
            exit={{ transform: "translateY(110%)", transition: transition.exit }}
            transition={spring.ui}
          >
            <div className={styles.stickyInfo}>
              <span className={styles.stickyName}>{product.name}</span>
              <span className="t-small t-soft">{colorName}</span>
            </div>
            <AddButton added={added} onAdd={onAdd} price={product.price * qty} soldOut={soldOut} compact />
          </m.div>
        )}
      </AnimatePresence>
    </>
  )
}

function AddButton({ added, onAdd, price, compact, soldOut }: { added: boolean; onAdd: () => void; price: number; compact?: boolean; soldOut?: boolean }) {
  return (
    <m.button
      type="button"
      className={`btn btn--primary ${styles.add}`}
      data-added={added}
      onClick={onAdd}
      disabled={soldOut}
      whileTap={{ scale: 0.97 }}
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
          {soldOut ? "Sold out" : added ? "Added to bag ✓" : compact ? `Add · ${formatPrice(price)}` : `Add to bag · ${formatPrice(price)}`}
        </m.span>
      </AnimatePresence>
    </m.button>
  )
}
