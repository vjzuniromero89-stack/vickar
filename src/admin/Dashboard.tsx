import { m } from "motion/react"
import { useEffect, useState } from "react"
import { Icon } from "../components/ui/Icon"
import { formatPrice } from "../data/catalog"
import { stagger, transition } from "../motion/tokens"
import { useCatalog } from "../state/CatalogContext"
import { ordersApi, statusLabel, statusTone, type AdminOrder } from "./ordersApi"
import { Pill } from "./ui"
import styles from "./admin.module.css"

export function Dashboard() {
  const { products, categories } = useCatalog()
  const [orders, setOrders] = useState<AdminOrder[] | null>(null)

  useEffect(() => {
    ordersApi.list().then(setOrders, () => setOrders([]))
  }, [])

  const since = Date.now() - 30 * 24 * 3600 * 1000
  const recent = (orders ?? []).filter((o) => new Date(o.created_at).getTime() >= since)
  const paidRecent = recent.filter((o) => ["paid", "shipped", "delivered"].includes(o.status))
  const revenue = paidRecent.reduce((n, o) => n + o.total, 0)
  const toShip = (orders ?? []).filter((o) => o.status === "paid").length
  const lowStock = products.filter((p) => p.stock != null && p.stock <= (p.lowStockAlert ?? 2))

  const stats = [
    { label: "Revenue · 30 days", value: ordersApi.available ? formatPrice(revenue) : "—" },
    { label: "Orders · 30 days", value: ordersApi.available ? String(paidRecent.length) : "—" },
    { label: "To ship", value: ordersApi.available ? String(toShip) : "—", href: "#/admin/orders" },
    { label: "Products", value: `${products.filter((p) => p.published).length} live / ${products.length}`, href: "#/admin/products" },
    { label: "Categories", value: String(categories.length), href: "#/admin/categories" },
    { label: "Low stock", value: String(lowStock.length), href: "#/admin/inventory" },
  ]

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div>
          <p className="t-label t-accent">Overview</p>
          <h1 className="t-h1">Dashboard</h1>
        </div>
        <a className="btn btn--primary" href="#/admin/products/new">
          <Icon name="plus" size={18} /> New product
        </a>
      </header>

      <m.ul className={styles.stats} initial="hidden" animate="shown" transition={{ staggerChildren: stagger.items }}>
        {stats.map((s) => (
          <m.li
            key={s.label}
            variants={{ hidden: { opacity: 0, transform: "translateY(10px)" }, shown: { opacity: 1, transform: "translateY(0px)" } }}
            transition={transition.reveal}
          >
            {s.href ? (
              <a href={s.href} className={styles.stat}>
                <span className="t-label t-soft">{s.label}</span>
                <span className={styles.statValue}>{s.value}</span>
              </a>
            ) : (
              <div className={styles.stat}>
                <span className="t-label t-soft">{s.label}</span>
                <span className={styles.statValue}>{s.value}</span>
              </div>
            )}
          </m.li>
        ))}
      </m.ul>

      <div className={styles.twoCol}>
        <section className={styles.panel} aria-labelledby="dash-orders">
          <div className={styles.panelHead}>
            <h2 id="dash-orders" className="t-h3">
              Latest orders
            </h2>
            <a href="#/admin/orders" className={styles.textButton}>
              All orders →
            </a>
          </div>
          {!ordersApi.available ? (
            <p className="t-soft t-small">Orders appear here once Supabase and Stripe are connected (SETUP.md).</p>
          ) : orders === null ? (
            <p className="t-soft t-small">Loading…</p>
          ) : orders.length === 0 ? (
            <p className="t-soft t-small">No orders yet.</p>
          ) : (
            <ul className={styles.list}>
              {orders.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <a href={`#/admin/orders/${o.id}`} className={styles.listRow}>
                    <span>
                      <strong>{o.number}</strong>
                      <span className="t-small t-soft"> · {o.customer_name}</span>
                    </span>
                    <Pill tone={statusTone[o.status]}>{statusLabel[o.status]}</Pill>
                    <span>{formatPrice(o.total)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="dash-stock">
          <div className={styles.panelHead}>
            <h2 id="dash-stock" className="t-h3">
              Low stock
            </h2>
          </div>
          {lowStock.length === 0 ? (
            <p className="t-soft t-small">Nothing running low. Each product warns at its own low-stock alert.</p>
          ) : (
            <ul className={styles.list}>
              {lowStock.map((p) => (
                <li key={p.id}>
                  <a href={`#/admin/products/${p.id}`} className={styles.listRow}>
                    <span>{p.name}</span>
                    <Pill tone={p.stock === 0 ? "error" : "warn"}>{p.stock === 0 ? "Sold out" : `${p.stock} left`}</Pill>
                    <span />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
