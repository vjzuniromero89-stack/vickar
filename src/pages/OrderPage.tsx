import { m, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { Icon } from "../components/ui/Icon"
import { formatPrice } from "../data/catalog"
import { api, ApiError, type OrderSummary } from "../lib/api"
import { ease, transition } from "../motion/tokens"
import { useBag } from "../state/BagContext"
import { useShop } from "../state/ShopContext"
import styles from "./OrderPage.module.css"

/**
 * Stripe redirects here after payment: `/?session_id=cs_...#/order`.
 * The server confirms the payment with Stripe, so this page is the source of truth
 * even if the webhook is still on its way. The bag is emptied once payment is confirmed.
 */
export function OrderPage() {
  const sessionId = new URLSearchParams(window.location.search).get("session_id") ?? ""
  const { clear } = useBag()
  const { shop } = useShop()
  const reduced = useReducedMotion()
  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [error, setError] = useState<string | null>(sessionId ? null : "This link is missing its order reference.")
  const cleared = useRef(false)

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    let tries = 0
    const load = async () => {
      try {
        const o = await api.order(sessionId)
        if (cancelled) return
        setOrder(o)
        if (o.status === "paid" && !cleared.current) {
          cleared.current = true
          clear()
        }
        // Card payments confirm in seconds; keep checking briefly while pending
        if (o.status === "pending" && ++tries < 8) window.setTimeout(load, 2500)
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "We couldn't load your order.")
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [sessionId, clear])

  if (error) {
    return (
      <section className={`container ${styles.page}`}>
        <h1 className="t-h1">Hmm.</h1>
        <p className="t-soft">{error}</p>
        <button type="button" className="btn btn--primary" onClick={() => shop("all")}>
          Back to the store
        </button>
      </section>
    )
  }

  if (!order) {
    return (
      <section className={`container ${styles.page}`} aria-busy="true">
        <p className="t-label t-soft">Confirming your payment…</p>
      </section>
    )
  }

  const paid = order.status !== "pending" && order.status !== "cancelled"

  return (
    <section className={`container ${styles.page}`} aria-labelledby="order-title">
      <div className={styles.badge} data-paid={paid}>
        <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
          <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
          {paid && (
            <m.path
              d="M14 24.5l7 7 13-14"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.7, ease: ease.out, delay: 0.2 }}
            />
          )}
        </svg>
      </div>

      <m.div
        className={styles.copy}
        initial={reduced ? { opacity: 0 } : { opacity: 0, transform: "translateY(12px)" }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
        transition={transition.reveal}
      >
        <p className="t-label t-accent">Order {order.number}</p>
        <h1 id="order-title" className="t-h1">
          {paid ? `Thank you, ${order.customer_name.split(" ")[0]}.` : order.status === "cancelled" ? "This order was cancelled." : "Payment processing…"}
        </h1>
        <p className="t-soft" role="status">
          {paid
            ? `Your order is confirmed. A receipt is on its way to ${order.email}. We'll email tracking as soon as it ships.`
            : order.status === "cancelled"
              ? "No payment was taken. Your bag is still saved if you'd like to try again."
              : "Your bank is confirming the payment. This page updates automatically."}
        </p>
      </m.div>

      <div className={styles.card}>
        <ul className={styles.items}>
          {order.items.map((i, idx) => (
            <li key={idx}>
              <span>
                {i.name} <span className="t-soft">· {i.colorName} × {i.qty}</span>
              </span>
              <span>{formatPrice(i.unitPrice * i.qty)}</span>
            </li>
          ))}
        </ul>
        <dl className={styles.totals}>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatPrice(order.subtotal)}</dd>
          </div>
          <div>
            <dt>Shipping{order.shipping_method ? ` · ${order.shipping_method.name}` : ""}</dt>
            <dd>{order.shipping === 0 ? "Free" : formatPrice(order.shipping)}</dd>
          </div>
          <div className={styles.total}>
            <dt>Total paid</dt>
            <dd>{formatPrice(order.total)}</dd>
          </div>
        </dl>
        {order.tracking_url && (
          <a className="btn btn--ghost" href={order.tracking_url} target="_blank" rel="noreferrer">
            Track shipment <Icon name="external" size={16} />
          </a>
        )}
      </div>

      <button type="button" className="btn btn--primary" onClick={() => shop("all")}>
        Continue shopping
      </button>
    </section>
  )
}
