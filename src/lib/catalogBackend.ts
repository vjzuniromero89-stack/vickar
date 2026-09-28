import { seedCategories, seedProducts, type ArtKind, type Category, type Product } from "../data/catalog"
import { IMAGE_BUCKET, supabase } from "./supabase"

export type CatalogData = { products: Product[]; categories: Category[] }

/** Everything the app needs from a catalogue backend. Swap implementations, not components. */
export type CatalogBackend = {
  mode: "demo" | "supabase"
  load(): Promise<CatalogData>
  saveProduct(p: Product): Promise<void>
  deleteProduct(id: string): Promise<void>
  saveCategory(c: Category): Promise<void>
  deleteCategory(id: string): Promise<void>
  /** Stores an image and returns a public URL (demo: a data URL). */
  uploadImage(file: Blob, productId: string): Promise<string>
  /** Demo only: restore the seed catalogue. */
  reset?(): Promise<CatalogData>
}

/* ---------------------------------------------------------------------------------------------
 * DEMO — localStorage in this browser. Great for designing; not shared, not secure.
 * ------------------------------------------------------------------------------------------- */

const STORAGE_KEY = "vickar.catalog.v1"

const readLocal = (): CatalogData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw) as CatalogData
      if (Array.isArray(data.products) && Array.isArray(data.categories)) return data
    }
  } catch {
    /* private mode / corrupted → seeds */
  }
  return { products: seedProducts, categories: seedCategories }
}

const writeLocal = (update: (d: CatalogData) => CatalogData) => {
  const next = update(readLocal())
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    throw new Error("This browser's storage is full. Use smaller images, or connect Supabase.")
  }
}

const upsert = <T extends { id: string }>(list: T[], item: T, prepend = false) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : prepend ? [item, ...list] : [...list, item]

const demoBackend: CatalogBackend = {
  mode: "demo",
  load: async () => readLocal(),
  saveProduct: async (p) => writeLocal((d) => ({ ...d, products: upsert(d.products, p, true) })),
  deleteProduct: async (id) => writeLocal((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) })),
  saveCategory: async (c) => writeLocal((d) => ({ ...d, categories: upsert(d.categories, c) })),
  deleteCategory: async (id) => writeLocal((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) })),
  uploadImage: (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error("Couldn't read the image."))
      reader.readAsDataURL(file)
    }),
  reset: async () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    return { products: seedProducts, categories: seedCategories }
  },
}

/* ---------------------------------------------------------------------------------------------
 * SUPABASE — Postgres tables `categories` / `products` + Storage bucket (see supabase/schema.sql)
 * ------------------------------------------------------------------------------------------- */

type CategoryRow = {
  id: string
  label: string
  headline: string[]
  pitch: string
  art: string
  spec: string
  position: number
}

type ProductRow = {
  id: string
  name: string
  category: string
  price: number
  compare_at: number | null
  rating: number
  reviews: number
  badge: Product["badge"] | null
  blurb: string
  specs: string[]
  swatches: Product["swatches"]
  art: string
  image: string | null
  image_alt: string | null
  published: boolean
  stock: number | null
  sku: string | null
  unit_cost: number
  low_stock_alert: number
  weight_kg: number
  length_cm: number
  width_cm: number
  height_cm: number
  hs_code: string | null
}

const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  label: r.label,
  headline: [r.headline?.[0] ?? "", r.headline?.[1] ?? ""],
  pitch: r.pitch,
  art: r.art as ArtKind,
  spec: r.spec,
})

const toProduct = (r: ProductRow): Product => ({
  id: r.id,
  name: r.name,
  category: r.category,
  price: Number(r.price),
  compareAt: r.compare_at == null ? undefined : Number(r.compare_at),
  rating: Number(r.rating),
  reviews: r.reviews,
  badge: r.badge ?? undefined,
  blurb: r.blurb,
  specs: r.specs ?? [],
  swatches: r.swatches ?? [],
  art: r.art as ArtKind,
  image: r.image ?? undefined,
  imageAlt: r.image_alt ?? undefined,
  published: r.published,
  stock: r.stock,
  sku: r.sku ?? undefined,
  unitCost: Number(r.unit_cost ?? 0),
  lowStockAlert: r.low_stock_alert ?? 2,
  weightKg: Number(r.weight_kg),
  lengthCm: Number(r.length_cm),
  widthCm: Number(r.width_cm),
  heightCm: Number(r.height_cm),
  hsCode: r.hs_code ?? undefined,
})

// Stock is intentionally NOT written from here: in Supabase it is derived from inventory movements.
const fromProduct = (p: Product): Omit<ProductRow, "stock"> => ({
  id: p.id,
  name: p.name,
  category: p.category,
  price: p.price,
  compare_at: p.compareAt ?? null,
  rating: p.rating,
  reviews: p.reviews,
  badge: p.badge ?? null,
  blurb: p.blurb,
  specs: p.specs,
  swatches: p.swatches,
  art: p.art,
  image: p.image ?? null,
  image_alt: p.imageAlt ?? null,
  published: p.published,
  sku: p.sku?.trim() || null,
  unit_cost: p.unitCost ?? 0,
  low_stock_alert: p.lowStockAlert ?? 2,
  weight_kg: p.weightKg ?? 0.5,
  length_cm: p.lengthCm ?? 10,
  width_cm: p.widthCm ?? 10,
  height_cm: p.heightCm ?? 10,
  hs_code: p.hsCode ?? null,
})

const check = <T>(res: { data: T; error: { message: string } | null }) => {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

const supabaseBackend = (): CatalogBackend => {
  const db = supabase!
  return {
    mode: "supabase",
    async load() {
      const [cats, prods] = await Promise.all([
        db.from("categories").select("*").order("position").order("label"),
        db.from("products").select("*").order("created_at", { ascending: false }),
      ])
      return {
        categories: (check(cats) as CategoryRow[]).map(toCategory),
        products: (check(prods) as ProductRow[]).map(toProduct),
      }
    },
    async saveProduct(p) {
      check(await db.from("products").upsert({ ...fromProduct(p), updated_at: new Date().toISOString() }))
    },
    async deleteProduct(id) {
      check(await db.from("products").delete().eq("id", id))
    },
    async saveCategory(c) {
      check(
        await db.from("categories").upsert({
          id: c.id,
          label: c.label,
          headline: c.headline,
          pitch: c.pitch,
          art: c.art,
          spec: c.spec,
        }),
      )
    },
    async deleteCategory(id) {
      check(await db.from("categories").delete().eq("id", id))
    },
    async uploadImage(file, productId) {
      const path = `products/${productId}-${Date.now()}.webp`
      const { error } = await db.storage.from(IMAGE_BUCKET).upload(path, file, {
        contentType: file.type || "image/webp",
        cacheControl: "31536000",
        upsert: false,
      })
      if (error) throw new Error(error.message)
      return db.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
    },
  }
}

export const catalogBackend: CatalogBackend = supabase ? supabaseBackend() : demoBackend

/**
 * Resize + re-encode an uploaded photo in the browser (max 1600px, WebP) before storing it:
 * keeps uploads small and fast regardless of what the camera produced.
 */
export async function prepareImage(file: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process the image."))), "image/webp", 0.85),
  )
}
