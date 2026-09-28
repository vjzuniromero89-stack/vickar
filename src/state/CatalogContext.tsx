import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { Category, Product } from "../data/catalog"
import { catalogBackend, prepareImage, type CatalogData } from "../lib/catalogBackend"

/**
 * Single source of truth for the catalogue — the storefront reads it, the admin writes it.
 * Updates are optimistic (the UI changes immediately); if the backend rejects a write,
 * the change is rolled back by reloading and the error is surfaced.
 */

type Status = "loading" | "ready" | "error"

type CatalogValue = {
  status: Status
  mode: "demo" | "supabase"
  /** Everything, including drafts (admin). */
  products: Product[]
  categories: Category[]
  /** Storefront view: published products in an existing category. */
  published: Product[]
  categoryById: (id: string) => Category | undefined
  categoryLabel: (id: string) => string
  saveProduct: (p: Product) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  saveCategory: (c: Category) => Promise<void>
  /** Refuses (returns false) while products still use the category. */
  deleteCategory: (id: string) => Promise<boolean>
  uploadImage: (file: File, productId: string) => Promise<string>
  reload: () => Promise<void>
  resetDemo?: () => Promise<void>
  error: string | null
  clearError: () => void
}

const CatalogContext = createContext<CatalogValue | null>(null)

const empty: CatalogData = { products: [], categories: [] }

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CatalogData>(empty)
  const [status, setStatus] = useState<Status>("loading")
  const [error, setError] = useState<string | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  const reload = useCallback(async () => {
    try {
      setData(await catalogBackend.load())
      setStatus("ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the catalogue.")
      setStatus("error")
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // Demo mode: keep tabs in sync (edit in #/admin, watch the store update in another tab)
  useEffect(() => {
    if (catalogBackend.mode !== "demo") return
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith("vickar.catalog")) void reload()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [reload])

  /** Apply locally first, persist, roll back on failure. */
  const mutate = useCallback(
    async (local: (d: CatalogData) => CatalogData, remote: () => Promise<void>) => {
      setData(local)
      try {
        await remote()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the change.")
        await reload()
        throw e
      }
    },
    [reload],
  )

  const upsert = <T extends { id: string }>(list: T[], item: T, prepend = false) =>
    list.some((x) => x.id === item.id)
      ? list.map((x) => (x.id === item.id ? item : x))
      : prepend
        ? [item, ...list]
        : [...list, item]

  const saveProduct = useCallback(
    (p: Product) =>
      mutate((d) => ({ ...d, products: upsert(d.products, p, true) }), () => catalogBackend.saveProduct(p)),
    [mutate],
  )

  const deleteProduct = useCallback(
    (id: string) =>
      mutate((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) }), () => catalogBackend.deleteProduct(id)),
    [mutate],
  )

  const saveCategory = useCallback(
    (c: Category) => mutate((d) => ({ ...d, categories: upsert(d.categories, c) }), () => catalogBackend.saveCategory(c)),
    [mutate],
  )

  const deleteCategory = useCallback(
    async (id: string) => {
      if (dataRef.current.products.some((p) => p.category === id)) return false
      await mutate(
        (d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }),
        () => catalogBackend.deleteCategory(id),
      )
      return true
    },
    [mutate],
  )

  const uploadImage = useCallback(async (file: File, productId: string) => {
    const blob = await prepareImage(file)
    return catalogBackend.uploadImage(blob, productId)
  }, [])

  const resetDemo = useMemo(
    () =>
      catalogBackend.reset
        ? async () => {
            setData(await catalogBackend.reset!())
          }
        : undefined,
    [],
  )

  const value = useMemo<CatalogValue>(() => {
    const categoryById = (id: string) => data.categories.find((c) => c.id === id)
    return {
      status,
      mode: catalogBackend.mode,
      products: data.products,
      categories: data.categories,
      published: data.products.filter((p) => p.published && data.categories.some((c) => c.id === p.category)),
      categoryById,
      categoryLabel: (id) => categoryById(id)?.label ?? "Uncategorised",
      saveProduct,
      deleteProduct,
      saveCategory,
      deleteCategory,
      uploadImage,
      reload,
      resetDemo,
      error,
      clearError: () => setError(null),
    }
  }, [data, status, saveProduct, deleteProduct, saveCategory, deleteCategory, uploadImage, reload, resetDemo, error])

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalog() {
  const ctx = useContext(CatalogContext)
  if (!ctx) throw new Error("useCatalog must be used inside <CatalogProvider>")
  return ctx
}

/** URL-safe id from a name, unique against existing ids. */
export function makeId(name: string, taken: string[]) {
  const base =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  let id = base
  let n = 2
  while (taken.includes(id)) id = `${base}-${n++}`
  return id
}
