import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { formatPrice, type Product } from "../../data/catalog"
import { useCatalog } from "../../state/CatalogContext"
import { useFocusTrap } from "../../hooks/useFocusTrap"
import { useScrollLock } from "../../hooks/useScrollLock"
import { spring, transition } from "../../motion/tokens"
import { useRouter } from "../../state/RouterContext"
import { useShop } from "../../state/ShopContext"
import { ProductArt } from "../product/ProductArt"
import { Icon } from "../ui/Icon"
import styles from "./SearchDialog.module.css"

type SearchDialogProps = { open: boolean; onClose: () => void }

export function SearchDialog({ open, onClose }: SearchDialogProps) {
  return <AnimatePresence>{open && <Palette onClose={onClose} />}</AnimatePresence>
}

const haystack = (p: Product, category: string) =>
  [p.name, category, p.blurb, ...p.specs, ...p.swatches.map((s) => s.name), p.badge ?? ""]
    .join(" ")
    .toLowerCase()

/** Every word typed must appear somewhere; name matches rank first. */
function search(query: string, products: Product[], label: (id: string) => string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  return products
    .filter((p) => words.every((w) => haystack(p, label(p.category)).includes(w)))
    .sort((a, b) => {
      const an = words.every((w) => a.name.toLowerCase().includes(w)) ? 0 : 1
      const bn = words.every((w) => b.name.toLowerCase().includes(w)) ? 0 : 1
      return an - bn || b.rating - a.rating
    })
}

/** Highlight matched words in a label. */
function highlight(text: string, query: string): ReactNode {
  const words = query.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  if (!words.length) return text
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"))
  return parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))
}

/**
 * Command-palette search (combobox + listbox pattern).
 * ↑/↓ move, Enter opens the product, Esc closes. Results reflow with layout animation.
 */
function Palette({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const uid = useId()
  const reduced = useReducedMotion()
  const { toProduct } = useRouter()
  const { shop } = useShop()
  const { published: products, categories, categoryLabel } = useCatalog()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  useFocusTrap(ref, true, onClose)
  useScrollLock(true)

  const popular = useMemo(() => [...products].sort((a, b) => b.reviews - a.reviews).slice(0, 4), [products])
  const results = useMemo(
    () => (query.trim() ? search(query, products, categoryLabel) : popular),
    [query, popular, products, categoryLabel],
  )
  const optionId = (i: number) => `${uid}-opt-${i}`

  const open = (p: Product) => {
    onClose()
    toProduct(p.id)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => Math.min(results.length - 1, a + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault()
      open(results[active])
    }
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
      <m.div
        ref={ref}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Search products"
        initial={reduced ? { opacity: 0 } : { opacity: 0, transform: "translateY(-12px) scale(0.98)" }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px) scale(1)" }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, transform: "translateY(-8px) scale(0.99)", transition: transition.exit }}
        transition={spring.ui}
      >
        <div className={styles.field}>
          <Icon name="search" />
          <input
            className={styles.input}
            type="search"
            placeholder="Search bottles, sunglasses, watches…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={`${uid}-list`}
            aria-activedescendant={results[active] ? optionId(active) : undefined}
            aria-autocomplete="list"
            aria-label="Search products"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className={`t-label ${styles.esc}`} onClick={onClose}>
            Esc
          </button>
        </div>

        {!query.trim() && (
          <div className={styles.chips}>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.chip}
                onClick={() => {
                  onClose()
                  shop(c.id)
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        <p className={`t-label t-soft ${styles.heading}`} id={`${uid}-heading`}>
          {query.trim() ? `${results.length} ${results.length === 1 ? "result" : "results"}` : "Popular right now"}
        </p>

        <ul id={`${uid}-list`} className={styles.list} role="listbox" aria-labelledby={`${uid}-heading`}>
          <AnimatePresence initial={false} mode="popLayout">
            {results.map((p, i) => (
              <m.li
                key={p.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className={styles.option}
                data-active={i === active}
                layout={!reduced}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ ...spring.snap, opacity: { duration: 0.2, delay: i * 0.03 } }}
                onPointerMove={() => setActive(i)}
                onClick={() => open(p)}
              >
                <span className={styles.thumb}>
                  {p.image ? <img src={p.image} alt="" className={styles.thumbImg} /> : <ProductArt kind={p.art} color={p.swatches[0]?.hex ?? "#888"} />}
                </span>
                <span className={styles.meta}>
                  <span className={styles.name}>{highlight(p.name, query)}</span>
                  <span className="t-label t-soft">{categoryLabel(p.category)}</span>
                </span>
                <span className={styles.price}>{formatPrice(p.price)}</span>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>

        {query.trim() && results.length === 0 && (
          <p className={styles.empty}>
            No products match “{query}”. Try a category above or a simpler word, like “steel” or “polarised”.
          </p>
        )}

        <p className={`t-label t-soft ${styles.hint}`} aria-hidden="true">
          ↑ ↓ to move · Enter to open · Esc to close
        </p>
      </m.div>
    </div>
  )
}
