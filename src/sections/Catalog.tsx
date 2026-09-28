import { AnimatePresence, LayoutGroup, m, useReducedMotion } from "motion/react"
import { useMemo, useState } from "react"
import { TextLines } from "../components/motion/TextLines"
import { ProductCard } from "../components/product/ProductCard"
import { QuickView, type QuickViewState } from "../components/product/QuickView"
import type { Product } from "../data/catalog"
import { useCatalog } from "../state/CatalogContext"
import { spring, transition } from "../motion/tokens"
import { useShop, type Filter } from "../state/ShopContext"
import styles from "./Catalog.module.css"

type Sort = "featured" | "price-asc" | "price-desc" | "rating"

const sorters: Record<Sort, (a: Product, b: Product) => number> = {
  featured: () => 0,
  "price-asc": (a, b) => a.price - b.price,
  "price-desc": (a, b) => b.price - a.price,
  rating: (a, b) => b.rating - a.rating,
}

/**
 * The whole catalogue on the same page. Filtering reflows the grid with layout animation
 * (cards glide to their new place; leaving cards fade and shrink), so the change is legible.
 */
export function Catalog() {
  const { filter, setFilter } = useShop()
  const { published: products, categories } = useCatalog()
  const [sort, setSort] = useState<Sort>("featured")
  const [quick, setQuick] = useState<QuickViewState>(null)
  const reduced = useReducedMotion()

  const list = useMemo(
    () => products.filter((p) => filter === "all" || p.category === filter).sort(sorters[sort]),
    [products, filter, sort],
  )

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: products.length },
    ...categories
      .map((c) => ({ id: c.id, label: c.label, count: products.filter((p) => p.category === c.id).length }))
      .filter((t) => t.count > 0),
  ]

  return (
    <section id="shop" className="container section" aria-labelledby="shop-title">
      <div className={styles.head}>
        <p className="t-label t-accent">01 / Shop</p>
        <TextLines as="h2" id="shop-title" className="t-h1" lines={["Every product,", "one place."]} />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters} role="group" aria-label="Filter by category">
          {tabs.map((t) => {
            const on = filter === t.id
            return (
              <button
                key={t.id}
                type="button"
                className={styles.filter}
                aria-pressed={on}
                onClick={() => setFilter(t.id)}
              >
                {on && <m.span layoutId="filter-pill" className={styles.pill} transition={spring.snap} />}
                <span className={styles.filterLabel}>{t.label}</span>
                <span className={styles.filterCount}>{t.count}</span>
              </button>
            )
          })}
        </div>

        <label className={styles.sort}>
          <span className="t-label t-soft">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="featured">Featured</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="rating">Top rated</option>
          </select>
        </label>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        Showing {list.length} {list.length === 1 ? "product" : "products"}
      </p>

      <LayoutGroup>
        <ul className={styles.grid}>
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((p, i) => (
              <m.li
                key={p.id}
                layout={!reduced}
                initial={reduced ? { opacity: 0 } : { opacity: 0, transform: "translateY(24px) scale(0.97)" }}
                whileInView={reduced ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px) scale(1)" }}
                viewport={{ once: true, margin: "0px 0px -8% 0px" }}
                exit={{ opacity: 0, transform: "scale(0.94)", transition: transition.exit }}
                transition={{ ...spring.layout, opacity: { duration: 0.5, delay: (i % 4) * 0.05 } }}
              >
                <ProductCard product={p} onQuickView={(product, color) => setQuick({ product, color })} />
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
        <QuickView state={quick} onClose={() => setQuick(null)} />
      </LayoutGroup>
    </section>
  )
}
