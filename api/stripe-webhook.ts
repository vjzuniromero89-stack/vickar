import type Stripe from "stripe"
import { env, handle, HttpError, json } from "./_lib/http.js"
import { markCancelled, markPaid, stripe } from "./_lib/orders.js"

/**
 * POST /api/stripe-webhook — Stripe → VICKAR.
 * Configure in Stripe → Developers → Webhooks → endpoint `https://<your-domain>/api/stripe-webhook`
 * with the events below, and copy its signing secret into STRIPE_WEBHOOK_SECRET.
 *
 * The signature is verified against the RAW body, so it's read with request.text() before parsing.
 */
export function POST(request: Request) {
  return handle(async () => {
    const signature = request.headers.get("stripe-signature")
    if (!signature) throw new HttpError(400, "Missing Stripe signature.")
    const raw = await request.text()

    let event: Stripe.Event
    try {
      event = await stripe().webhooks.constructEventAsync(raw, signature, env("STRIPE_WEBHOOK_SECRET"))
    } catch {
      throw new HttpError(400, "Invalid Stripe signature.")
    }

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await markPaid(event.data.object)
        break
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await markCancelled(event.data.object.id)
        break
      default:
        break
    }
    return json({ received: true })
  })
}
