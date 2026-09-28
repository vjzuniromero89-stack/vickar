import {
  AnimatePresence,
  animate,
  m,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react"
import { useEffect, useRef, useState } from "react"
import { ProductArt } from "../components/product/ProductArt"
import { formatPrice, type Category, type Product } from "../data/catalog"
import { useCatalog } from "../state/CatalogContext"
import { duration, ease, transition } from "../motion/tokens"
import { useShop } from "../state/ShopContext"
import styles from "./Hero.module.css"

const FRAMES = 120

const fromPrice = (c: Category, products: Product[]) =>
  Math.min(...products.filter((p) => p.category === c.id).map((p) => p.price))
const heroColor = (c: Category, products: Product[]) =>
  products.find((p) => p.category === c.id)?.swatches[0]?.hex ?? "#ff7a45"

/** Hero chapters are generated from the live catalogue: only categories with published products. */
function useHeroData() {
  const { categories: all, published: products } = useCatalog()
  const categories = all.filter((c) => products.some((p) => p.category === c.id))
  return { categories, products, chapters: categories.length + 1 }
}

/**
 * "Everything. One store." — a pinned, scroll-driven hero.
 * 00 shows the whole store at a glance; 01–05 walk through each category, where the product
 * is first drawn as a blueprint and then materialises as you keep scrolling.
 */
export function Hero() {
  const reduced = useReducedMotion()
  return reduced ? <StaticHero /> : <PinnedHero />
}

function PinnedHero() {
  const { categories, products, chapters: CHAPTERS } = useHeroData()
  const track = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLSpanElement>(null)
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] })
  const [active, setActive] = useState(0)

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setActive(Math.min(CHAPTERS - 1, Math.floor(p * CHAPTERS)))
    if (frameRef.current) frameRef.current.textContent = String(Math.round(p * FRAMES)).padStart(3, "0")
  })

  // Progress inside the current chapter (0 → 1)
  const local = useTransform(() => {
    const v = scrollYProgress.get() * CHAPTERS
    const idx = Math.min(CHAPTERS - 1, Math.floor(v))
    return Math.min(1, Math.max(0, v - idx))
  })
  // The product materialises between 12% and 62% of its chapter
  const materialize = useTransform(local, [0.12, 0.62], [0, 1], { clamp: true })
  const barScale = useTransform(scrollYProgress, [0, 1], [0, 1])

  const goTo = (i: number) => {
    const el = track.current
    if (!el) return
    const range = el.offsetHeight - window.innerHeight
    const target = el.offsetTop + range * (i === 0 ? 0 : (i + 0.7) / CHAPTERS)
    window.scrollTo({ top: target, behavior: "smooth" })
  }

  const category = active > 0 ? categories[active - 1] : null

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <h1 id="hero-title" className="sr-only">VICKAR — everything, one store</h1>
      <div ref={track} className={styles.track} style={{ height: `${CHAPTERS * 100}svh` }}>
        <div className={styles.sticky}>
          <div className={styles.grid} aria-hidden="true" />
          <AnimatePresence>
            <m.div
              key={category?.id ?? "all"}
              className={styles.glow}
              style={{ ["--glow" as string]: category ? heroColor(category, products) : "var(--c-accent)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              aria-hidden="true"
            />
          </AnimatePresence>

          {/* HUD */}
          <div className={`container ${styles.hud}`} aria-hidden="true">
            <span className="t-label">
              <span className={styles.dot} /> VICKAR / Store online
            </span>
            <span className={`t-label ${styles.hudCenter}`}>
              System {String(active).padStart(2, "0")} / {category ? category.label : "All categories"}
            </span>
            <span className="t-label">
              Frame <span ref={frameRef}>000</span>/{FRAMES}
            </span>
          </div>

          <div className={`container ${styles.stage}`}>
            {/* Copy */}
            <div className={styles.copy}>
              <AnimatePresence mode="wait" initial={false}>
                <m.div
                  key={active}
                  className={styles.copyInner}
                  initial={{ opacity: 0, transform: "translateY(24px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  exit={{ opacity: 0, transform: "translateY(-16px)", transition: transition.exit }}
                  transition={transition.reveal}
                >
                  {category ? (
                    <ChapterCopy category={category} index={active} />
                  ) : (
                    <OverviewCopy />
                  )}
                </m.div>
              </AnimatePresence>
            </div>

            {/* Product stage */}
            <div className={styles.artStage}>
              <AnimatePresence mode="popLayout" initial={false}>
                <m.div
                  key={active}
                  className={styles.artFrame}
                  initial={{ opacity: 0, transform: "scale(0.94)" }}
                  animate={{ opacity: 1, transform: "scale(1)" }}
                  exit={{ opacity: 0, transform: "scale(1.04)", transition: transition.exit }}
                  transition={{ duration: duration.reveal, ease: ease.out }}
                >
                  {category ? (
                    <ChapterArt category={category} color={heroColor(category, products)} materialize={materialize} />
                  ) : (
                    <OverviewArt />
                  )}
                </m.div>
              </AnimatePresence>
            </div>

            {/* Chapter index */}
            <nav className={styles.index} aria-label="Hero chapters">
              <ol>
                {["Overview", ...categories.map((c) => c.label)].map((label, i) => (
                  <li key={label}>
                    <button
                      type="button"
                      className={styles.indexItem}
                      data-active={active === i}
                      aria-current={active === i ? "step" : undefined}
                      onClick={() => goTo(i)}
                    >
                      <span className={styles.indexNum}>{String(i).padStart(2, "0")}</span>
                      <span className={styles.indexLabel}>{label}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          </div>

          {/* Footer bar */}
          <div className={`container ${styles.foot}`} aria-hidden="true">
            <span className="t-label t-soft">Scroll to explore</span>
            <span className={styles.bar}>
              <m.span className={styles.barFill} style={{ scaleX: barScale }} />
            </span>
            <span className="t-label t-soft">{category ? category.spec : `${categories.length} categories`}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------- */

function OverviewCopy() {
  const { shop } = useShop()
  const { products } = useHeroData()
  const totalProducts = products.length
  return (
    <>
      <p className="t-label t-accent">00 / Overview</p>
      <h2 className={`t-mega ${styles.title}`}>
        Everything.
        <br />
        One <span className="t-serif">store.</span>
      </h2>
      <p className={`t-soft ${styles.pitch}`}>
        Bottles, sunglasses, watches and more — chosen, tested and shipped by VICKAR. Scroll to see how
        every piece is made.
      </p>
      <div className={styles.actions}>
        <button type="button" className="btn btn--primary" onClick={() => shop("all")}>
          Shop all {totalProducts} products
        </button>
      </div>
    </>
  )
}

function ChapterCopy({ category, index }: { category: Category; index: number }) {
  const { shop } = useShop()
  const { products } = useHeroData()
  return (
    <>
      <p className="t-label t-accent">
        {String(index).padStart(2, "0")} / {category.label}
      </p>
      <h2 className={`t-mega ${styles.title}`}>
        {category.headline[0]}
        <br />
        <span className="t-soft">{category.headline[1]}</span>
      </h2>
      <p className={`t-soft ${styles.pitch}`}>{category.pitch}</p>
      <div className={styles.actions}>
        <button type="button" className="btn btn--primary" onClick={() => shop(category.id)}>
          Shop {category.label.toLowerCase()}
        </button>
        <span className="t-label t-soft">From {formatPrice(fromPrice(category, products))}</span>
      </div>
    </>
  )
}

function ChapterArt({ category, color, materialize }: { category: Category; color: string; materialize: MotionValue<number> }) {
  const [draw, setDraw] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setDraw(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div className={styles.artSingle}>
      <ProductArt kind={category.art} color={color} materialize={materialize} draw={draw} />
    </div>
  )
}

/** 00 — the whole store at a glance: every category drawn, then materialised in sequence. */
function OverviewArt() {
  const { categories } = useHeroData()
  return (
    <div className={styles.overview}>
      {categories.map((c, i) => (
        <OverviewItem key={c.id} category={c} index={i} />
      ))}
    </div>
  )
}

function OverviewItem({ category, index }: { category: Category; index: number }) {
  const { products } = useHeroData()
  const mat = useMotionValue(0)
  const [draw, setDraw] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDraw(true), index * 120)
    const controls = animate(mat, 1, { duration: 0.9, ease: ease.out, delay: 1.1 + index * 0.15 })
    return () => {
      clearTimeout(t)
      controls.stop()
    }
  }, [index, mat])

  return (
    <div className={styles.overviewItem} style={{ ["--i" as string]: index }}>
      <ProductArt kind={category.art} color={heroColor(category, products)} materialize={mat} draw={draw} />
      <span className="t-label t-soft">{category.label}</span>
    </div>
  )
}

/** Reduced motion: no pinning, no scrubbing — the same content as a calm, static layout. */
function StaticHero() {
  const { shop } = useShop()
  const { categories, products } = useHeroData()
  const totalProducts = products.length
  return (
    <section className={`container ${styles.static}`} aria-labelledby="hero-title">
      <p className="t-label t-accent">VICKAR / Store</p>
      <h1 id="hero-title" className={`t-mega ${styles.title}`}>
        Everything.
        <br />
        One <span className="t-serif">store.</span>
      </h1>
      <button type="button" className="btn btn--primary" onClick={() => shop("all")}>
        Shop all {totalProducts} products
      </button>
      <ul className={styles.staticList}>
        {categories.map((c) => (
          <li key={c.id}>
            <button type="button" className={styles.staticItem} onClick={() => shop(c.id)}>
              <span className={styles.staticArt}>
                <ProductArt kind={c.art} color={heroColor(c, products)} materialize={1} draw={false} />
              </span>
              <span className={styles.staticLabel}>{c.label}</span>
              <span className="t-label t-soft">From {formatPrice(fromPrice(c, products))}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
