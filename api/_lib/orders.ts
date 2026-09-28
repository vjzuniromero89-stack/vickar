import Stripe from "stripe"
import type { Address, PricedLine } from "./cart.js"
import { db } from "./db.js"
import { env } from "./http.js"
import { createShipment, type ShippingRate } from "./shipping.js"

let stripeClient: Stripe | null = null
export function stripe() {
  if (!stripeClient) stripeClient = new Stripe(env("STRIPE_SECRET_KEY"))
  return stripeClient
}

export function orderNumber() {
  const t = Date.now().toString(36).toUpperCase()
  const r = Math.floor(Math.random() * 36 ** 3).toString(36).toUpperCase().padStart(3, "0")
  return `VK-${t}-${r}`
}

/**
 * Marks the order for a Stripe Checkout Session as paid — exactly once.
 * The `status = 'pending'` guard makes it idempotent: Stripe retries webhooks, and the
 * confirmation page may also call this, but stock is deducted and the shipment created only once.
 */
export async function markPaid(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return false

  const { data: rows, error } = await db()
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stripe_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
    })
    .eq("stripe_session_id", session.id)
    .eq("status", "pending")
    .select("id, number, items, shipping_address, shipping_method")
  if (error) throw new Error(error.message)
  const order = rows?.[0]
  if (!order) return false // already processed (or unknown session)

  const items = order.items as PricedLine[]
  for (const item of items) {
    const { error: stockError } = await db().rpc("decrement_stock", { p_id: item.productId, p_qty: item.qty })
    if (stockError) console.error("Stock update failed", item.productId, stockError.message)
  }

  // Shipment creation must never make the payment look failed: log and let the admin retry.
  try {
    const shipment = await createShipment({
      number: order.number,
      shipping_address: order.shipping_address as Address,
      items,
      shipping_method: order.shipping_method as ShippingRate | null,
    })
    if (shipment) {
      await db()
        .from("orders")
        .update({
          easyship_shipment_id: shipment.shipmentId,
          tracking_url: shipment.trackingUrl,
          tracking_number: shipment.trackingNumber,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
    }
  } catch (e) {
    console.error("Easyship shipment creation failed for", order.number, e)
  }
  return true
}

export async function markCancelled(sessionId: string) {
  await db()
    .from("orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("stripe_session_id", sessionId)
    .eq("status", "pending")
}
