import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import { BagDrawer } from "./components/bag/BagDrawer"
import { Footer } from "./components/layout/Footer"
import { Header } from "./components/layout/Header"
import { MenuOverlay } from "./components/layout/MenuOverlay"
import { SearchDialog } from "./components/search/SearchDialog"
import { MotionProvider } from "./motion/MotionProvider"
import { transition } from "./motion/tokens"
import { CheckoutPage } from "./pages/CheckoutPage"
import { Home } from "./pages/Home"
import { AccountPage } from "./pages/AccountPage"
import { OrderPage } from "./pages/OrderPage"
import { ProductPage } from "./pages/ProductPage"
import { BagProvider } from "./state/BagContext"
import { CatalogProvider } from "./state/CatalogContext"
import { RouterProvider, routeKey, useRouter } from "./state/RouterContext"
import { SessionProvider } from "./state/SessionContext"
import { ShopProvider } from "./state/ShopContext"

// The admin is only downloaded by people who open #/admin
const AdminApp = lazy(() => import("./admin/AdminApp").then((mod) => ({ default: mod.AdminApp })))

export function App() {
  return (
    <MotionProvider>
      <RouterProvider>
        <SessionProvider>
        <CatalogProvider>
          <ShopProvider>
            <BagProvider>
              <Shell />
            </BagProvider>
          </ShopProvider>
        </CatalogProvider>
        </SessionProvider>
      </RouterProvider>
    </MotionProvider>
  )
}

function Shell() {
  const { route } = useRouter()
  const reduced = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const toggleMenu = useCallback(() => setMenuOpen((o) => !o), [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const openSearch = useCallback(() => {
    setMenuOpen(false)
    setSearchOpen(true)
  }, [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])
  const isAdmin = route.name === "admin"
  const key = routeKey(route)

  // "/" or Ctrl/⌘+K opens search in the store — unless the user is typing somewhere
  useEffect(() => {
    if (isAdmin) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault()
        openSearch()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openSearch, isAdmin])

  // New page → start at the top (home keeps anchor scrolling like #shop)
  useEffect(() => {
    if (route.name !== "home") window.scrollTo({ top: 0, behavior: "instant" })
  }, [key, route.name])

  if (isAdmin) {
    return (
      <Suspense fallback={<p style={{ padding: "2rem" }}>Loading admin…</p>}>
        <AdminApp view={route.view} id={route.id} />
      </Suspense>
    )
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header menuOpen={menuOpen} onToggleMenu={toggleMenu} onSearch={openSearch} />
      <MenuOverlay open={menuOpen} onClose={closeMenu} onSearch={openSearch} />
      <AnimatePresence mode="wait" initial={false}>
        {/* Opacity only: a transform here would re-anchor the fixed dialogs and bars inside <main> */}
        <m.main
          key={key}
          id="main-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: transition.exit }}
          transition={reduced ? { duration: 0.2 } : transition.reveal}
        >
          {route.name === "product" ? (
            <ProductPage id={route.id} />
          ) : route.name === "checkout" ? (
            <CheckoutPage />
          ) : route.name === "order" ? (
            <OrderPage />
          ) : route.name === "account" ? (
            <AccountPage />
          ) : (
            <Home />
          )}
        </m.main>
      </AnimatePresence>
      <Footer />
      <SearchDialog open={searchOpen} onClose={closeSearch} />
      <BagDrawer />
    </>
  )
}
