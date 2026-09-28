import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react"
import type { Product } from "../data/catalog"
import { useCatalog } from "./CatalogContext"

/** A bag line is a product in a specific colour. */
type Line = { key: string; productId: string; color: string; qty: number }

type Action =
  | { type: "add"; productId: string; color: string }
  | { type: "setQty"; key: string; qty: number }
  | { type: "remove"; key: string }
  | { type: "clear" }

const BAG_KEY = "vickar.bag.v1"

function loadBag(): Line[] {
  try {
    const raw = localStorage.getItem(BAG_KEY)
    const lines = raw ? (JSON.parse(raw) as Line[]) : []
    return Array.isArray(lines) ? lines.filter((l) => l && typeof l.key === "string" && l.qty > 0) : []
  } catch {
    return []
  }
}

const lineKey = (productId: string, color: string) => `${productId}:${color}`

function reducer(lines: Line[], action: Action): Line[] {
  switch (action.type) {
    case "add": {
      const key = lineKey(action.productId, action.color)
      const found = lines.find((l) => l.key === key)
      if (found) return lines.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l))
      return [...lines, { key, productId: action.productId, color: action.color, qty: 1 }]
    }
    case "setQty":
      return action.qty <= 0
        ? lines.filter((l) => l.key !== action.key)
        : lines.map((l) => (l.key === action.key ? { ...l, qty: action.qty } : l))
    case "remove":
      return lines.filter((l) => l.key !== action.key)
    case "clear":
      return []
  }
}

export type BagLine = Line & { product: Product; colorName: string }

type BagValue = {
  lines: BagLine[]
  count: number
  subtotal: number
  isOpen: boolean
  open: () => void
  close: () => void
  add: (productId: string, color: string) => void
  setQty: (key: string, qty: number) => void
  remove: (key: string) => void
  clear: () => void
}

const BagContext = createContext<BagValue | null>(null)

export function BagProvider({ children }: { children: ReactNode }) {
  const { products } = useCatalog()
  // The bag survives reloads and the round trip to Stripe Checkout
  const [rawLines, dispatch] = useReducer(reducer, [], loadBag)
  useEffect(() => {
    try {
      localStorage.setItem(BAG_KEY, JSON.stringify(rawLines))
    } catch {
      /* storage blocked: the bag still works for this visit */
    }
  }, [rawLines])
  const [isOpen, setOpen] = useState(false)
  const [announcement, setAnnouncement] = useState("")

  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])

  const add = useCallback((productId: string, color: string) => {
    dispatch({ type: "add", productId, color })
    const p = products.find((x) => x.id === productId)
    const colorName = p?.swatches.find((s) => s.hex === color)?.name
    setAnnouncement(`${p?.name ?? "Item"}${colorName ? `, ${colorName},` : ""} added to your bag`)
  }, [products])

  const clear = useCallback(() => dispatch({ type: "clear" }), [])

  const setQty = useCallback((key: string, qty: number) => dispatch({ type: "setQty", key, qty }), [])

  const remove = useCallback((key: string) => {
    dispatch({ type: "remove", key })
    setAnnouncement("Item removed from your bag")
  }, [])

  const value = useMemo<BagValue>(() => {
    const lines = rawLines.flatMap((l) => {
      const product = products.find((p) => p.id === l.productId)
      if (!product) return []
      const colorName = product.swatches.find((s) => s.hex === l.color)?.name ?? ""
      return [{ ...l, product, colorName }]
    })
    return {
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      subtotal: lines.reduce((n, l) => n + l.qty * l.product.price, 0),
      isOpen,
      open,
      close,
      add,
      setQty,
      remove,
      clear,
    }
  }, [rawLines, products, isOpen, open, close, add, setQty, remove, clear])

  return (
    <BagContext.Provider value={value}>
      {children}
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>
    </BagContext.Provider>
  )
}

export function useBag() {
  const ctx = useContext(BagContext)
  if (!ctx) throw new Error("useBag must be used inside <BagProvider>")
  return ctx
}
