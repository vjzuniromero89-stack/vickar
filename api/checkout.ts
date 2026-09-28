import { priceCart, round2, validateAddress, type Address, type CartItemInput } from "./_lib/cart.js"
import { db } from "./_lib/db.js"
import { handle, HttpError, json, readJson, siteUrl } from "./_lib/http.js"
import { orderNumber, stripe } from "./_lib/orders.js"
import { getRates } from "./_lib/shipping.js"

/**
 * POST /api/checkout  { items, address, rateId }  →  { url }
 *
 * 1. Re-prices the cart and re-quotes shipping on the server (the chosen rate must still exist).
 * 2. Saves a `pending` order in Supabase.
 * 3. Creates a Stripe Checkout Session for exactly those amounts and returns its URL.
 * The order becomes `paid` only when Stripe confirms it (api/stripe-webhook.ts).
 */
export function POST(request: Request) {
  return handle(async () => {
    const payments = stripe() // fails fast (clear 500) if Stripe isn't configured — before any order is written
    const body = await readJson<{ items: CartItemInput[]; address: Partial<Address>; rateId: string }>(request)
    const address = validateAddress(body.address)
    const { lines, subtotal } = await priceCart(body.items)

    const rates = await getRates(address, lines, subtotal)
    const rate = rates.find((r) => r.id === body.rateId)
    if (!rate) throw new HttpError(409, "Shipping options changed. Please choose a shipping method again.")

    const number = orderNumber()
    const total = round2(subtotal + rate.amount)

    const { data: order, error } = await db()
      .from("orders")
      .insert({
        number,
        status: "pending",
        email: address.email,
        customer_name: address.name,
        phone: address.phone ?? null,
        shipping_address: address,
        items: lines,
        subtotal,
        shipping: rate.amount,
        total,
        currency: "usd",
        shipping_method: rate,
      })
      .select("id")
      .single()
    if (error) throw new Error(error.message)

    const site = siteUrl(request)
    const session = await payments.checkout.sessions.create({
      mode: "payment",
      customer_email: address.email,
      client_reference_id: order.id,
      metadata: { order_id: order.id, order_number: number },
      payment_intent_data: { metadata: { order_id: order.id, order_number: number } },
      line_items: lines.map((l) => ({
        quantity: l.qty,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(l.unitPrice * 100),
          product_data: {
            name: l.name,
            description: `Colour: ${l.colorName}`,
            // Stripe only accepts public http(s) images (not demo data URLs)
            ...(l.image?.startsWith("https://") ? { images: [l.image] } : {}),
          },
        },
      })),
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            display_name: rate.name,
            fixed_amount: { amount: Math.round(rate.amount * 100), currency: "usd" },
            ...(rate.minDays && rate.maxDays
              ? {
                  delivery_estimate: {
                    minimum: { unit: "business_day" as const, value: rate.minDays },
                    maximum: { unit: "business_day" as const, value: rate.maxDays },
                  },
                }
              : {}),
          },
        },
      ],
      // Stripe fills {CHECKOUT_SESSION_ID}; the query sits before the hash so the app can read it
      success_url: `${site}/?session_id={CHECKOUT_SESSION_ID}#/order`,
      cancel_url: `${site}/#/checkout`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    })

    await db().from("orders").update({ stripe_session_id: session.id }).eq("id", order.id)

    return json({ url: session.url, number })
  })
}
