import { supabase } from "../lib/supabase"

/** Inventory + accounting data (Supabase, admins only via Row Level Security). */

export type MovementType = "opening_stock" | "received" | "return" | "sale" | "other_out" | "adjustment"

export type Movement = {
  id: string
  product_id: string
  product_name: string
  sku: string | null
  type: MovementType
  quantity: number
  unit_cost: number
  reason: string | null
  order_id: string | null
  created_at: string
}

export type Expense = {
  id: string
  expense_date: string
  description: string
  category: string
  vendor: string | null
  amount: number
  created_at: string
}

export type Partner = { id: string; name: string; share_pct: number }

export type SaleOrder = {
  id: string
  number: string
  status: "paid" | "shipped" | "delivered" | "refunded"
  customer_name: string
  items: { productId: string; name: string; qty: number; unitPrice: number; unitCost?: number }[]
  subtotal: number
  shipping: number
  total: number
  tax: number
  discount: number
  cogs: number
  stripe_fee: number | null
  shipping_cost: number
  paid_at: string | null
  created_at: string
}

export const movementLabels: Record<MovementType, string> = {
  opening_stock: "Opening stock",
  received: "Received",
  return: "Return",
  sale: "Sale",
  other_out: "Other out",
  adjustment: "Adjustment",
}

export const expenseCategories = [
  "Advertising",
  "Packaging",
  "Shipping",
  "Software",
  "Office & supplies",
  "Professional services",
  "Payroll",
  "Contractors",
  "Rent",
  "Utilities",
  "Insurance",
  "Travel",
  "Other",
]

const db = () => {
  if (!supabase) throw new Error("This section needs Supabase connected.")
  return supabase
}

const check = <T,>(res: { data: T; error: { message: string } | null }) => {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

const n = (v: unknown) => Number(v ?? 0)

export const financeApi = {
  available: Boolean(supabase),

  async movements(): Promise<Movement[]> {
    const rows = check(await db().from("inventory_movements").select("*").order("created_at", { ascending: false }).limit(2000))
    return (rows ?? []).map((m) => ({ ...m, unit_cost: n(m.unit_cost) })) as Movement[]
  },

  async addMovement(m: { product_id: string; product_name: string; sku?: string; type: MovementType; quantity: number; unit_cost: number; reason?: string }) {
    const { data: auth } = await db().auth.getUser()
    check(await db().from("inventory_movements").insert({ ...m, sku: m.sku || null, reason: m.reason || null, created_by: auth.user?.id ?? null }))
  },

  async updateMovement(id: string, patch: { quantity: number; unit_cost: number; reason: string | null }) {
    check(await db().from("inventory_movements").update(patch).eq("id", id))
  },

  async deleteMovement(id: string) {
    check(await db().from("inventory_movements").delete().eq("id", id))
  },

  async sales(from: string, to: string): Promise<SaleOrder[]> {
    const rows = check(
      await db()
        .from("orders")
        .select("id, number, status, customer_name, items, subtotal, shipping, total, tax, discount, cogs, stripe_fee, shipping_cost, paid_at, created_at")
        .in("status", ["paid", "shipped", "delivered", "refunded"])
        .gte("paid_at", `${from}T00:00:00`)
        .lte("paid_at", `${to}T23:59:59.999`)
        .order("paid_at", { ascending: false }),
    )
    return (rows ?? []).map((o) => ({
      ...o,
      subtotal: n(o.subtotal),
      shipping: n(o.shipping),
      total: n(o.total),
      tax: n(o.tax),
      discount: n(o.discount),
      cogs: n(o.cogs),
      stripe_fee: o.stripe_fee == null ? null : n(o.stripe_fee),
      shipping_cost: n(o.shipping_cost),
    })) as SaleOrder[]
  },

  async expenses(from: string, to: string): Promise<Expense[]> {
    const rows = check(
      await db().from("expenses").select("*").gte("expense_date", from).lte("expense_date", to).order("expense_date", { ascending: false }),
    )
    return (rows ?? []).map((e) => ({ ...e, amount: n(e.amount) })) as Expense[]
  },

  async addExpense(e: { expense_date: string; description: string; category: string; vendor?: string; amount: number }) {
    const { data: auth } = await db().auth.getUser()
    check(await db().from("expenses").insert({ ...e, vendor: e.vendor || null, created_by: auth.user?.id ?? null }))
  },

  async deleteExpense(id: string) {
    check(await db().from("expenses").delete().eq("id", id))
  },

  async partners(): Promise<Partner[]> {
    const rows = check(await db().from("business_partners").select("id, name, share_pct").order("created_at"))
    return (rows ?? []).map((p) => ({ ...p, share_pct: n(p.share_pct) })) as Partner[]
  },

  /** Replace the whole partner list (percentages must add up to 100). */
  async savePartners(list: { name: string; share_pct: number }[]) {
    check(await db().from("business_partners").delete().not("id", "is", null))
    if (list.length) check(await db().from("business_partners").insert(list))
  },

  /** Ask the server to fetch real Stripe fees for paid orders that don't have one yet. */
  async syncStripeFees(): Promise<{ updated: number; pending: number }> {
    const { data } = await db().auth.getSession()
    const res = await fetch("/api/sync-stripe-fees", {
      method: "POST",
      headers: { authorization: `Bearer ${data.session?.access_token ?? ""}` },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error ?? "Couldn't sync Stripe fees.")
    return body
  },
}

/** Profit of one order: what we keep after tax (not ours), Stripe, product cost and shipping labels. */
export const orderProfit = (o: SaleOrder) => o.total - o.tax - (o.stripe_fee ?? 0) - o.cogs - o.shipping_cost

export const localDate = (d: Date) => d.toLocaleDateString("en-CA")
