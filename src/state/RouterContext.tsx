import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

/**
 * Minimal hash router — works on any static host (Vercel, no rewrites needed).
 * Plain anchors like `#shop` keep working and resolve to the home route.
 */
export type AdminView = "dashboard" | "products" | "product" | "categories" | "orders" | "order"

export type Route =
  | { name: "home" }
  | { name: "product"; id: string }
  | { name: "checkout" }
  | { name: "order" }
  | { name: "account" }
  | { name: "admin"; view: AdminView; id?: string }

const parse = (hash: string): Route => {
  let m: RegExpMatchArray | null
  if ((m = hash.match(/^#\/p\/([\w-]+)/))) return { name: "product", id: m[1] }
  if (hash.startsWith("#/checkout")) return { name: "checkout" }
  if (hash.startsWith("#/order")) return { name: "order" }
  if (hash.startsWith("#/account")) return { name: "account" }
  if (hash.startsWith("#/admin")) {
    if ((m = hash.match(/^#\/admin\/products\/([\w-]+)/))) return { name: "admin", view: "product", id: m[1] }
    if (hash.startsWith("#/admin/products")) return { name: "admin", view: "products" }
    if (hash.startsWith("#/admin/categories")) return { name: "admin", view: "categories" }
    if ((m = hash.match(/^#\/admin\/orders\/([\w-]+)/))) return { name: "admin", view: "order", id: m[1] }
    if (hash.startsWith("#/admin/orders")) return { name: "admin", view: "orders" }
    return { name: "admin", view: "dashboard" }
  }
  return { name: "home" }
}

type RouterValue = {
  route: Route
  go: (hash: string) => void
  toProduct: (id: string) => void
  toHome: () => void
}

const RouterContext = createContext<RouterValue | null>(null)

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash))

  useEffect(() => {
    const onHash = () => setRoute(parse(window.location.hash))
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const go = useCallback((hash: string) => {
    window.location.hash = hash
  }, [])
  const toProduct = useCallback((id: string) => go(`#/p/${id}`), [go])
  const toHome = useCallback(() => go("#/"), [go])

  const value = useMemo(() => ({ route, go, toProduct, toHome }), [route, go, toProduct, toHome])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter() {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error("useRouter must be used inside <RouterProvider>")
  return ctx
}

/** Stable key per page, for page transitions and scroll reset. */
export const routeKey = (r: Route) =>
  r.name === "product" ? `p-${r.id}` : r.name === "admin" ? `admin-${r.view}-${r.id ?? ""}` : r.name
