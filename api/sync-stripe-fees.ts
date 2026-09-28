import { db } from "./_lib/db.js"
import { handle, HttpError, json } from "./_lib/http.js"
import { stripeFeeFor } from "./_lib/orders.js"

/**
 * POST /api/sync-stripe-fees — admin only.
 * Fills in the real Stripe fee for paid orders that don't have it yet (e.g. orders placed
 * before this feature, or whose fee wasn't settled when the webhook arrived).
 */
export function POST(request: Request) {
  return handle(async () => {
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1]
    if (!token) throw new HttpError(401, "Please sign in.")
    const { data: auth } = await db().auth.getUser(token)
    const userId = auth?.user?.id
    if (!userId) throw new HttpError(401, "Your session expired. Please sign in again.")
    const { data: admin } = await db().from("admins").select("user_id").eq("user_id", userId).maybeSingle()
    if (!admin) throw new HttpError(403, "Admins only.")

    const { data: orders, error } = await db()
      .from("orders")
      .select("id, stripe_payment_intent")
      .in("status", ["paid", "shipped", "delivered", "refunded"])
      .is("stripe_fee", null)
      .not("stripe_payment_intent", "is", null)
      .limit(50)
    if (error) throw new Error(error.message)

    let updated = 0
    let pending = 0
    for (const o of orders ?? []) {
      const fee = await stripeFeeFor(o.stripe_payment_intent as string)
      if (!fee) {
        pending++
        continue
      }
      await db().from("orders").update({ stripe_fee: fee.fee, stripe_net: fee.net }).eq("id", o.id)
      updated++
    }
    return json({ updated, pending })
  })
}
