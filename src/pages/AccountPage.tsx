import { m, useReducedMotion } from "motion/react"
import { useEffect, useState, type FormEvent } from "react"
import { AuthPanel } from "../components/account/AuthPanel"
import { Icon } from "../components/ui/Icon"
import { formatPrice } from "../data/catalog"
import { countries } from "../data/countries"
import { supabase } from "../lib/supabase"
import { stagger, transition } from "../motion/tokens"
import { useSession } from "../state/SessionContext"
import { useShop } from "../state/ShopContext"
import styles from "./AccountPage.module.css"

type CustomerOrder = {
  id: string
  number: string
  status: "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "refunded"
  items: { name: string; colorName: string; qty: number; unitPrice: number }[]
  total: number
  shipping_method: { name: string } | null
  tracking_url: string | null
  tracking_number: string | null
  created_at: string
}

/** Customer-facing wording — calmer than the admin's operational labels. */
const statusCopy: Record<CustomerOrder["status"], { label: string; tone: string }> = {
  pending: { label: "Awaiting payment", tone: "muted" },
  paid: { label: "Preparing your order", tone: "warn" },
  shipped: { label: "On its way", tone: "info" },
  delivered: { label: "Delivered", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "muted" },
  refunded: { label: "Refunded", tone: "muted" },
}

export function AccountPage() {
  const session = useSession()

  if (!session.enabled) {
    return (
      <section className={`container ${styles.page}`}>
        <h1 className="t-h1">Accounts</h1>
        <p className="t-soft">Customer accounts turn on when Supabase is connected (see SETUP.md).</p>
      </section>
    )
  }

  if (session.loading) return <section className={`container ${styles.page}`} aria-busy="true" />

  if (session.recovering) return <NewPassword />

  if (!session.user) {
    return (
      <section className={`container ${styles.page} ${styles.centered}`}>
        <AuthPanel
          title="Your VICKAR account"
          subtitle="Sign in to see your orders and track every shipment in one place."
        />
      </section>
    )
  }

  return <Dashboard />
}

function Dashboard() {
  const { user, name, savedAddress, signOut } = useSession()
  const { shop } = useShop()
  const reduced = useReducedMotion()
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase || !user) return
    // RLS returns only this customer's orders; abandoned checkouts (pending/cancelled) are not orders
    supabase
      .from("orders")
      .select("id, number, status, items, total, shipping_method, tracking_url, tracking_number, created_at")
      .eq("user_id", user.id)
      .in("status", ["paid", "shipped", "delivered", "refunded"])
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError("We couldn't load your orders. Please refresh the page.")
        setOrders((data ?? []).map((o) => ({ ...o, total: Number(o.total) })) as CustomerOrder[])
      })
  }, [user])

  const country = countries.find((c) => c.code === savedAddress?.country)?.name ?? savedAddress?.country

  return (
    <section className={`container ${styles.page}`} aria-labelledby="account-title">
      <header className={styles.head}>
        <div>
          <p className="t-label t-accent">Your account</p>
          <h1 id="account-title" className="t-h1">
            Hi, {name.split(" ")[0]}.
          </h1>
          <p className="t-soft">{user?.email}</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={signOut}>
          <Icon name="logout" size={18} /> Sign out
        </button>
      </header>

      <div className={styles.layout}>
        <div className={styles.orders}>
          <h2 className="t-h3">Your orders</h2>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {orders === null ? (
            <div className={styles.skeleton} aria-busy="true" aria-label="Loading orders" />
          ) : orders.length === 0 ? (
            <div className={styles.empty}>
              <p className="t-h3">No orders yet.</p>
              <p className="t-soft">When you buy something, it'll appear here with its tracking.</p>
              <button type="button" className="btn btn--primary" onClick={() => shop("all")}>
                Start shopping
              </button>
            </div>
          ) : (
            <m.ul className={styles.list} initial="hidden" animate="shown" transition={{ staggerChildren: stagger.items }}>
              {orders.map((o) => (
                <m.li
                  key={o.id}
                  className={styles.order}
                  variants={{
                    hidden: reduced ? { opacity: 0 } : { opacity: 0, transform: "translateY(10px)" },
                    shown: reduced ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" },
                  }}
                  transition={transition.reveal}
                >
                  <div className={styles.orderHead}>
                    <div>
                      <p className={styles.orderNumber}>{o.number}</p>
                      <p className="t-small t-soft">
                        {new Date(o.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
                        {o.shipping_method ? ` · ${o.shipping_method.name}` : ""}
                      </p>
                    </div>
                    <span className={styles.status} data-tone={statusCopy[o.status].tone}>
                      {statusCopy[o.status].label}
                    </span>
                  </div>
                  <ul className={styles.items}>
                    {o.items.map((i, idx) => (
                      <li key={idx}>
                        <span>
                          {i.name} <span className="t-soft">· {i.colorName} × {i.qty}</span>
                        </span>
                        <span>{formatPrice(i.unitPrice * i.qty)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className={styles.orderFoot}>
                    <span>
                      Total <strong>{formatPrice(o.total)}</strong>
                    </span>
                    {o.tracking_url ? (
                      <a className="btn btn--ghost" href={o.tracking_url} target="_blank" rel="noreferrer">
                        Track package <Icon name="external" size={16} />
                      </a>
                    ) : o.tracking_number ? (
                      <span className="t-small t-soft">Tracking: {o.tracking_number}</span>
                    ) : (
                      <span className="t-small t-soft">Tracking appears here once it ships.</span>
                    )}
                  </div>
                </m.li>
              ))}
            </m.ul>
          )}
        </div>

        <aside className={styles.side}>
          <h2 className="t-h3">Shipping address</h2>
          {savedAddress?.line1 ? (
            <address className={styles.address}>
              {savedAddress.name}
              <br />
              {savedAddress.line1}
              {savedAddress.line2 ? (
                <>
                  <br />
                  {savedAddress.line2}
                </>
              ) : null}
              <br />
              {savedAddress.city}
              {savedAddress.state ? `, ${savedAddress.state}` : ""} {savedAddress.postalCode}
              <br />
              {country}
            </address>
          ) : (
            <p className="t-soft t-small">Saved automatically the first time you check out.</p>
          )}
        </aside>
      </div>
    </section>
  )
}

function NewPassword() {
  const { updatePassword } = useSession()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setError("Use a password with at least 8 characters.")
    setBusy(true)
    const res = await updatePassword(password)
    setBusy(false)
    setError(res.error)
  }

  return (
    <section className={`container ${styles.page} ${styles.centered}`}>
      <form className={styles.newPassword} onSubmit={submit} noValidate>
        <h1 className="t-h2">Choose a new password</h1>
        <label htmlFor="np-password">New password</label>
        <input
          id="np-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "np-error" : undefined}
        />
        {error && (
          <p id="np-error" className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </section>
  )
}
