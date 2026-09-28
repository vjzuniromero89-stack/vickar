import { AnimatePresence, m, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react"
import { useState } from "react"
import { spring, transition } from "../../motion/tokens"
import { useBag } from "../../state/BagContext"
import { useCatalog } from "../../state/CatalogContext"
import { useShop } from "../../state/ShopContext"
import { Logo } from "../brand/Logo"
import { Icon } from "../ui/Icon"
import styles from "./Header.module.css"

type HeaderProps = { menuOpen: boolean; onToggleMenu: () => void; onSearch: () => void }

/**
 * Floating glass bar. Hides on scroll down, returns on scroll up; categories jump
 * straight into the filtered catalogue from any page.
 */
export function Header({ menuOpen, onToggleMenu, onSearch }: HeaderProps) {
  const { count, open: openBag, isOpen: bagOpen } = useBag()
  const { shop } = useShop()
  const { categories, published } = useCatalog()
  const liveCategories = categories.filter((c) => published.some((p) => p.category === c.id))
  const { scrollY } = useScroll()
  const reduced = useReducedMotion()
  const [hidden, setHidden] = useState(false)

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0
    if (Math.abs(y - prev) < 6) return
    setHidden(y > prev && y > 200)
  })

  const isHidden = hidden && !menuOpen && !bagOpen

  return (
    <m.header
      className={styles.header}
      initial={false}
      animate={{ transform: isHidden ? "translateY(-130%)" : "translateY(0%)" }}
      transition={reduced ? { duration: 0 } : isHidden ? transition.exit : transition.ui}
    >
      <nav className={styles.bar} aria-label="Main">
        <a className={styles.logo} href="#/" aria-label="VICKAR — home">
          <Logo />
        </a>

        <ul className={styles.links}>
          <li>
            <button type="button" onClick={() => shop("all")}>
              Shop all
            </button>
          </li>
          {liveCategories.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => shop(c.id)}>
                {c.label}
              </button>
            </li>
          ))}
        </ul>

        <div className={styles.right}>
          <button type="button" className={styles.search} onClick={onSearch} aria-label="Search products" aria-keyshortcuts="/ Control+K">
            <Icon name="search" size={18} />
            <span className={styles.searchText} aria-hidden="true">
              Search
            </span>
            <kbd className={styles.kbd} aria-hidden="true">
              /
            </kbd>
          </button>
          <button
            type="button"
            className={styles.bag}
            onClick={openBag}
            aria-haspopup="dialog"
            aria-label={`Bag, ${count} ${count === 1 ? "item" : "items"}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 8h14l-1 12H6L5 8Zm4 0V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span className={styles.count} aria-hidden="true">
              <AnimatePresence mode="popLayout" initial={false}>
                <m.span
                  key={count}
                  initial={{ transform: "translateY(90%)", opacity: 0 }}
                  animate={{ transform: "translateY(0%)", opacity: 1 }}
                  exit={{ transform: "translateY(-90%)", opacity: 0 }}
                  transition={spring.snap}
                >
                  {count}
                </m.span>
              </AnimatePresence>
            </span>
          </button>
          <button
            type="button"
            className={styles.menu}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={onToggleMenu}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <span className={styles.burger} data-open={menuOpen} aria-hidden="true">
              <span />
              <span />
            </span>
          </button>
        </div>
      </nav>
    </m.header>
  )
}
