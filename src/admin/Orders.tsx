import { m } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Icon } from "../components/ui/Icon"
import { formatPrice } from "../data/catalog"
import { countries } from "../data/countries"
import { spring } from "../motion/tokens"
import { ordersApi, statusLabel, statusTone, type AdminOrder, type OrderStatus } from "./ordersApi"
import { Pill, useToast } from "./ui"
import styles from "./admin.module.css"

const tabs: { id: OrderStatus | "all"; label: string }[] = [
  { id: "paid", label: "To ship" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "all", label: "All" },
]

const date = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })

function useOrders() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    ordersApi.list().then(setOrders, (e: Error) => {
      setError(e.message)
      setOrders([])
    })
  }, [])
  useEffect(load, [load])
  return { orders, error, reload: load }
}

export function Orders() {
  const { orders, error } = useOrders()
  const [tab, setTab] = useState<OrderStatus | "all">("paid")
  const [q, setQ] = useState("")

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return (orders ?? []).filter(
      (o) =>
        (tab === "all" || o.status === tab) &&
        words.every((w) => `${o.number} ${o.email} ${o.customer_name}`.toLowerCase().includes(w)),
    )
  }, [orders, tab, q])

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div>
          <p className="t-label t-accent">Sales</p>
          <h1 className="t-h1">Orders</h1>
        </div>
      </header>

      {!ordersApi.available ? (
        <div className={styles.emptyState}>
          <p className="t-h3">Orders need the live backend.</p>
          <p className="t-soft">
            Connect Supabase and Stripe (SETUP.md). Every paid checkout then appears here automatically, with its shipment from Easyship.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <div className={styles.tabs} role="group" aria-label="Filter orders by status">
              {tabs.map((t) => (
                <button key={t.id} type="button" className={styles.tab} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                  {tab === t.id && <m.span layoutId="orders-tab" className={styles.tabPill} transition={spring.snap} />}
                  <span className={styles.tabLabel}>
                    {t.label}
                    {orders && t.id !== "all" && <span className={styles.tabCount}>{orders.filter((o) => o.status === t.id).length}</span>}
                  </span>
                </button>
              ))}
            </div>
            <label className={styles.search}>
              <Icon name="search" size={18} />
              <span className="sr-only">Search orders</span>
              <input type="search" placeholder="Order number, name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>

          {error && <p className={styles.errorBanner}>{error}</p>}

          {orders === null ? (
            <p className="t-soft">Loading orders…</p>
          ) : list.length === 0 ? (
            <div className={styles.emptyState}>
              <p className="t-h3">{tab === "paid" ? "Nothing to ship right now." : "No orders here."}</p>
            </div>
          ) : (
            <ul className={styles.list}>
              {list.map((o) => (
                <li key={o.id}>
                  <a href={`#/admin/orders/${o.id}`} className={`${styles.listRow} ${styles.orderRow}`}>
                    <span>
                      <strong>{o.number}</strong>
                      <span className="t-small t-soft"> · {date(o.created_at)}</span>
                    </span>
                    <span className="t-small">
                      {o.customer_name}
                      <span className="t-soft"> · {o.items.reduce((n, i) => n + i.qty, 0)} items</span>
                    </span>
                    <Pill tone={statusTone[o.status]}>{statusLabel[o.status]}</Pill>
                    <span>{formatPrice(o.total)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

export function OrderDetail({ id }: { id: string }) {
  const { orders, reload } = useOrders()
  const toast = useToast()
  const order = orders?.find((o) => o.id === id)
  const [form, setForm] = useState({ status: "paid" as OrderStatus, tracking_number: "", tracking_url: "", notes: "" })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (order)
      setForm({
        status: order.status,
        tracking_number: order.tracking_number ?? "",
        tracking_url: order.tracking_url ?? "",
        notes: order.notes ?? "",
      })
  }, [order])

  if (!orders) return <p className="t-soft">Loading…</p>
  if (!order) {
    return (
      <div className={styles.page}>
        <p className="t-soft">Order not found.</p>
        <a href="#/admin/orders" className={styles.textButton}>
          ← Orders
        </a>
      </div>
    )
  }

  const save = async () => {
    setSaving(true)
    try {
      await ordersApi.update(order.id, {
        status: form.status,
        tracking_number: form.tracking_number || null,
        tracking_url: form.tracking_url || null,
        notes: form.notes || null,
      })
      toast(`${order.number} updated`)
      reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update the order", "error")
    } finally {
      setSaving(false)
    }
  }

  const a = order.shipping_address
  const country = countries.find((c) => c.code === a.country)?.name ?? a.country

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div>
          <a href="#/admin/orders" className={styles.textButton}>
            ← Orders
          </a>
          <h1 className="t-h1">{order.number}</h1>
          <p className="t-soft t-small">
            Placed {date(order.created_at)}
            {order.paid_at ? ` · paid ${date(order.paid_at)}` : ""}
          </p>
        </div>
        <Pill tone={statusTone[order.status]}>{statusLabel[order.status]}</Pill>
      </header>

      <div className={styles.editor}>
        <div className={styles.editorMain}>
          <section className={styles.panel} aria-labelledby="od-items">
            <h2 id="od-items" className="t-h3">
              Items
            </h2>
            <ul className={styles.list}>
              {order.items.map((i, idx) => (
                <li key={idx} className={styles.listRow}>
                  <span>
                    {i.name} <span className="t-soft t-small">· {i.colorName}</span>
                  </span>
                  <span className="t-small t-soft">× {i.qty}</span>
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
                <dt>Shipping · {order.shipping_method?.name ?? "—"}</dt>
                <dd>{formatPrice(order.shipping)}</dd>
              </div>
              <div className={styles.totalRow}>
                <dt>Total</dt>
                <dd>{formatPrice(order.total)}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.panel} aria-labelledby="od-fulfil">
            <h2 id="od-fulfil" className="t-h3">
              Fulfilment
            </h2>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label htmlFor="od-status">Status</label>
                <select id="od-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as OrderStatus })}>
                  {(Object.keys(statusLabel) as OrderStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {statusLabel[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="od-tn">Tracking number</label>
                <input id="od-tn" value={form.tracking_number} onChange={(e) => setForm({ ...form, tracking_number: e.target.value })} />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="od-tu">Tracking link</label>
              <input id="od-tu" type="url" value={form.tracking_url} onChange={(e) => setForm({ ...form, tracking_url: e.target.value })} />
            </div>
            <div className={styles.field}>
              <label htmlFor="od-notes">Internal notes</label>
              <textarea id="od-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className={styles.inlineActions}>
              <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save order"}
              </button>
            </div>
            <p className={styles.hint}>Refunds are issued from Stripe; then set the status to “Refunded” here.</p>
          </section>
        </div>

        <aside className={styles.editorSide}>
          <section className={styles.panel} aria-labelledby="od-customer">
            <h2 id="od-customer" className="t-h3">
              Customer
            </h2>
            <p>
              {order.customer_name}
              <br />
              <a href={`mailto:${order.email}`} className={styles.textButton}>
                {order.email}
              </a>
              {order.phone && (
                <>
                  <br />
                  <span className="t-soft">{order.phone}</span>
                </>
              )}
            </p>
            <h3 className="t-label t-soft">Ship to</h3>
            <address className={styles.address}>
              {a.name}
              <br />
              {a.line1}
              {a.line2 && (
                <>
                  <br />
                  {a.line2}
                </>
              )}
              <br />
              {a.city}
              {a.state ? `, ${a.state}` : ""} {a.postalCode}
              <br />
              {country}
            </address>
          </section>
          <section className={styles.panel} aria-labelledby="od-links">
            <h2 id="od-links" className="t-h3">
              Payment & shipment
            </h2>
            <ul className={styles.linkList}>
              {order.stripe_payment_intent && (
                <li>
                  <a href={`https://dashboard.stripe.com/payments/${order.stripe_payment_intent}`} target="_blank" rel="noreferrer">
                    Open payment in Stripe <Icon name="external" size={14} />
                  </a>
                </li>
              )}
              {order.easyship_shipment_id ? (
                <li>
                  <a href="https://app.easyship.com/shipments" target="_blank" rel="noreferrer">
                    Easyship shipment {order.easyship_shipment_id} <Icon name="external" size={14} />
                  </a>
                </li>
              ) : (
                <li className="t-soft t-small">No Easyship shipment (flat-rate shipping or Easyship not connected).</li>
              )}
              {order.tracking_url && (
                <li>
                  <a href={order.tracking_url} target="_blank" rel="noreferrer">
                    Tracking page <Icon name="external" size={14} />
                  </a>
                </li>
              )}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
