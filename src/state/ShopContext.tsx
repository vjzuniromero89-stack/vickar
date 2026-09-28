import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import type { CategoryId } from "../data/catalog"
import { useRouter } from "./RouterContext"

export type Filter = CategoryId | "all"

type ShopValue = {
  filter: Filter
  setFilter: (f: Filter) => void
  /** Jump to the catalogue with a category pre-selected (hero CTAs, menu, footer) — from any page. */
  shop: (f?: Filter) => void
}

const ShopContext = createContext<ShopValue | null>(null)

const scrollToShop = () => {
  const el = document.getElementById("shop")
  if (!el) return false
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  return true
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<Filter>("all")
  const { route, toHome } = useRouter()

  const shop = useCallback(
    (f: Filter = "all") => {
      setFilter(f)
      if (route.name === "home") {
        requestAnimationFrame(scrollToShop)
        return
      }
      // Coming from a product page: go home, then scroll once the catalogue has mounted
      toHome()
      let tries = 0
      const wait = () => {
        if (scrollToShop() || ++tries > 40) return
        requestAnimationFrame(wait)
      }
      window.setTimeout(wait, 350)
    },
    [route.name, toHome],
  )

  const value = useMemo(() => ({ filter, setFilter, shop }), [filter, shop])
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop() {
  const ctx = useContext(ShopContext)
  if (!ctx) throw new Error("useShop must be used inside <ShopProvider>")
  return ctx
}
