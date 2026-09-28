import { db } from "./db.js"
import { HttpError } from "./http.js"

export type CartItemInput = { productId: string; color: string; qty: number }

export type Address = {
  name: string
  email: string
  phone?: string
  line1: string
  line2?: string
  city: string
  state?: string
  postalCode: string
  country: string // ISO alpha-2
}

export type PricedLine = {
  productId: string
  name: string
  color: string
  colorName: string
  qty: number
  unitPrice: number
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
  hsCode: string | null
  image: string | null
}

/**
 * The browser only says *what* it wants. Prices, names, availability and stock are always
 * re-read from the database here, so a tampered cart can't change what the customer pays.
 */
export async function priceCart(items: CartItemInput[]): Promise<{ lines: PricedLine[]; subtotal: number }> {
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, "Your bag is empty.")
  if (items.length > 50) throw new HttpError(400, "Too many items in one order.")

  const ids = [...new Set(items.map((i) => String(i.productId)))]
  const { data, error } = await db()
    .from("products")
    .select("id, name, price, published, swatches, stock, weight_kg, length_cm, width_cm, height_cm, hs_code, image")
    .in("id", ids)
  if (error) throw new Error(error.message)

  const byId = new Map((data ?? []).map((p) => [p.id as string, p]))
  const qtyById = new Map<string, number>()

  const lines = items.map((item) => {
    const p = byId.get(item.productId)
    if (!p || !p.published) throw new HttpError(409, "One of the products in your bag is no longer available.")
    const qty = Math.floor(Number(item.qty))
    if (!Number.isFinite(qty) || qty < 1 || qty > 20) throw new HttpError(400, "Invalid quantity.")
    const swatch = (p.swatches as { name: string; hex: string }[]).find((s) => s.hex === item.color)
    if (!swatch) throw new HttpError(409, `The selected colour of ${p.name} is no longer available.`)
    qtyById.set(p.id, (qtyById.get(p.id) ?? 0) + qty)
    return {
      productId: p.id,
      name: p.name,
      color: swatch.hex,
      colorName: swatch.name,
      qty,
      unitPrice: Number(p.price),
      weightKg: Number(p.weight_kg),
      lengthCm: Number(p.length_cm),
      widthCm: Number(p.width_cm),
      heightCm: Number(p.height_cm),
      hsCode: p.hs_code,
      image: p.image,
    } satisfies PricedLine
  })

  for (const [id, qty] of qtyById) {
    const stock = byId.get(id)!.stock as number | null
    if (stock != null && qty > stock) {
      throw new HttpError(409, `Only ${stock} left of ${byId.get(id)!.name}. Please lower the quantity.`)
    }
  }

  const subtotal = round2(lines.reduce((n, l) => n + l.unitPrice * l.qty, 0))
  return { lines, subtotal }
}

export function validateAddress(a: Partial<Address> | undefined): Address {
  const s = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "")
  const address: Address = {
    name: s(a?.name),
    email: s(a?.email, 200).toLowerCase(),
    phone: s(a?.phone, 40) || undefined,
    line1: s(a?.line1),
    line2: s(a?.line2) || undefined,
    city: s(a?.city),
    state: s(a?.state, 60) || undefined,
    postalCode: s(a?.postalCode, 20),
    country: s(a?.country, 2).toUpperCase(),
  }
  const missing = (["name", "email", "line1", "city", "postalCode", "country"] as const).filter((k) => !address[k])
  if (missing.length) throw new HttpError(400, `Missing: ${missing.join(", ")}.`)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email)) throw new HttpError(400, "Please enter a valid email.")
  if (!/^[A-Z]{2}$/.test(address.country)) throw new HttpError(400, "Please choose a country.")
  if (["US", "CA", "MX", "AU"].includes(address.country) && !address.state) {
    throw new HttpError(400, "Please enter your state / province.")
  }
  return address
}

export const round2 = (n: number) => Math.round(n * 100) / 100
