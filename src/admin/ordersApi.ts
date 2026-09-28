import { supabase } from "../lib/supabase"

export type OrderStatus = "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "refunded"

export type AdminOrder = {
  id: string
  number: string
  status: OrderStatus
  email: string
  customer_name: string
  phone: string | null
  shipping_address: {
    name: string
    line1: string
    line2?: string
    city: string
    state?: string
    postalCode: string
    country: string
  }
  items: { productId: string; name: string; colorName: string; qty: number; unitPrice: number }[]
  subtotal: number
  shipping: number
  total: number
  shipping_method: { name: string; provider: string; minDays: number | null; maxDays: number | null } | null
  stripe_payment_intent: string | null
  easyship_shipment_id: string | null
  tracking_number: string | null
  tracking_url: string | null
  notes: string | null
  shipping_cost: number
  paid_at: string | null
  created_at: string
}

/** Orders live only in Supabase (written by the Stripe webhook); RLS limits reads/updates to admins. */
export const ordersApi = {
  available: Boolean(supabase),
  async list(): Promise<AdminOrder[]> {
    if (!supabase) return []
    const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(500)
    if (error) throw new Error(error.message)
    return (data ?? []).map((o) => ({ ...o, subtotal: Number(o.subtotal), shipping: Number(o.shipping), total: Number(o.total), shipping_cost: Number(o.shipping_cost ?? 0) }))
  },
  async update(id: string, patch: Partial<Pick<AdminOrder, "status" | "tracking_number" | "tracking_url" | "notes" | "shipping_cost">>) {
    if (!supabase) return
    const { error } = await supabase.from("orders").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id)
    if (error) throw new Error(error.message)
  },
}

export const statusTone: Record<OrderStatus, "ok" | "warn" | "muted" | "info" | "error"> = {
  pending: "muted",
  paid: "warn",
  shipped: "info",
  delivered: "ok",
  cancelled: "muted",
  refunded: "error",
}

export const statusLabel: Record<OrderStatus, string> = {
  pending: "Awaiting payment",
  paid: "Paid · to ship",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
}
