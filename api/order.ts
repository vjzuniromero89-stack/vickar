import { db } from "./_lib/db.js"
import { handle, HttpError, json } from "./_lib/http.js"
import { markPaid, stripe } from "./_lib/orders.js"

/**
 * GET /api/order?session_id=cs_...  →  public-safe order summary for the confirmation page.
 * If the webhook hasn't arrived yet, the session is checked with Stripe directly, so the
 * customer never sees a "pending" order that was actually paid.
 */
export function GET(request: Request) {
  return handle(async () => {
    const sessionId = new URL(request.url).searchParams.get("session_id") ?? ""
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new HttpError(400, "Invalid order reference.")

    const load = () =>
      db()
        .from("orders")
        .select("number, status, email, customer_name, items, subtotal, shipping, total, currency, shipping_method, tracking_url, created_at")
        .eq("stripe_session_id", sessionId)
        .maybeSingle()

    let { data: order, error } = await load()
    if (error) throw new Error(error.message)
    if (!order) throw new HttpError(404, "We couldn't find this order.")

    if (order.status === "pending") {
      const session = await stripe().checkout.sessions.retrieve(sessionId)
      if (await markPaid(session)) ({ data: order } = await load())
    }

    const [user, domain] = String(order!.email).split("@")
    return json({
      ...order,
      email: `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`,
      items: (order!.items as { name: string; colorName: string; qty: number; unitPrice: number }[]).map((i) => ({
        name: i.name,
        colorName: i.colorName,
        qty: i.qty,
        unitPrice: i.unitPrice,
      })),
    })
  })
}
