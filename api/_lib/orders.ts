import Stripe from "stripe"
import type { Address, PricedLine } from "./cart.js"
import { round2 } from "./cart.js"
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
 * The REAL processing fee for a payment, as reported by Stripe on the charge's balance
 * transaction (never a hard-coded percentage). Returns null if Stripe hasn't settled it yet.
 */
export async function stripeFeeFor(paymentIntentId: string): Promise<{ fee: number; net: number } | null> {
  const pi = await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] })
  const charge = pi.latest_charge
  const bt = charge && typeof charge !== "string" ? charge.balance_transaction : null
  if (!bt || typeof bt === "string") return null
  return { fee: round2(bt.fee / 100), net: round2(bt.net / 100) }
}

/**
 * Marks the order for a Stripe Checkout Session as paid — exactly once.
 * The `status = 'pending'` guard makes it idempotent: Stripe retries webhooks, and the
 * confirmation page may also call this, but inventory, fees and the shipment happen once.
 */
export async function markPaid(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return false
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id

  const { data: rows, error } = await db()
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stripe_payment_intent: paymentIntent,
      // Tax and discounts exactly as Stripe charged them (0 until Stripe Tax / coupons are enabled)
      tax: round2((session.total_details?.amount_tax ?? 0) / 100),
      discount: round2((session.total_details?.amount_discount ?? 0) / 100),
    })
    .eq("stripe_session_id", session.id)
    .eq("status", "pending")
    .select("id, number, items, shipping_address, shipping_method")
  if (error) throw new Error(error.message)
  const order = rows?.[0]
  if (!order) return false // already processed (or unknown session)

  // Inventory: one sale movement per tracked product (idempotent in the database)
  const { error: invError } = await db().rpc("record_sale_movements", { p_order_id: order.id })
  if (invError) console.error("Inventory update failed for", order.number, invError.message)

  // Real Stripe fee — if not settled yet, the admin's "Sync Stripe fees" fills it in later
  if (paymentIntent) {
    try {
      const fee = await stripeFeeFor(paymentIntent)
      if (fee) await db().from("orders").update({ stripe_fee: fee.fee, stripe_net: fee.net }).eq("id", order.id)
    } catch (e) {
      console.error("Stripe fee lookup failed for", order.number, e)
    }
  }

  // Shipment creation must never make the payment look failed: log and let the admin retry.
  try {
    const shipment = await createShipment({
      number: order.number,
      shipping_address: order.shipping_address as Address,
      items: order.items as PricedLine[],
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
