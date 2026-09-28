import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { formatPrice } from "../data/catalog"
import { stagger, transition } from "../motion/tokens"
import { expenseCategories, financeApi, localDate, orderProfit, type Expense, type Partner, type SaleOrder } from "./financeApi"
import { useConfirm, useToast } from "./ui"
import styles from "./admin.module.css"
import f from "./finance.module.css"

type Range = "today" | "7d" | "30d" | "month" | "quarter" | "year" | "all" | "custom"

const ranges: { id: Range; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
  { id: "quarter", label: "This quarter" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom…" },
]

function rangeDates(r: Range, custom: { from: string; to: string }) {
  const now = new Date()
  const to = localDate(now)
  const daysAgo = (n: number) => localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
  switch (r) {
    case "today":
      return { from: to, to }
    case "7d":
      return { from: daysAgo(6), to }
    case "30d":
      return { from: daysAgo(29), to }
    case "month":
      return { from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), to }
    case "quarter":
      return { from: localDate(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to }
    case "year":
      return { from: `${now.getFullYear()}-01-01`, to }
    case "all":
      return { from: "2000-01-01", to }
    case "custom":
      return custom
  }
}

/** Always two decimals — accounting reads cents. */
const cents = (n: number) =>
  `${n < 0 ? "−" : ""}${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Math.abs(n))}`

/**
 * Financial overview: sales, costs, Stripe fees, taxes and real profit from every paid order,
 * plus operating expenses and each partner's share. Every figure comes from orders/expenses.
 */
export function Accounting() {
  const toast = useToast()
  const [range, setRange] = useState<Range>("30d")
  const [custom, setCustom] = useState({ from: localDate(new Date(Date.now() - 29 * 864e5)), to: localDate(new Date()) })
  const { from, to } = rangeDates(range, custom)
  const [orders, setOrders] = useState<SaleOrder[] | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [editingPartners, setEditingPartners] = useState(false)

  const load = useCallback(async () => {
    try {
      const [o, e, p] = await Promise.all([financeApi.sales(from, to), financeApi.expenses(from, to), financeApi.partners()])
      setOrders(o)
      setExpenses(e)
      setPartners(p)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error && /column .* does not exist|relation .* does not exist/i.test(err.message)
          ? "Accounting isn't installed yet. Run supabase/migrations/004_inventory_accounting.sql in Supabase → SQL Editor."
          : err instanceof Error
            ? err.message
            : "Couldn't load accounting.",
      )
    }
  }, [from, to])

  useEffect(() => {
    if (financeApi.available) void load()
  }, [load])

  const s = useMemo(() => summarize(orders ?? [], expenses), [orders, expenses])

  const syncFees = async () => {
    setSyncing(true)
    try {
      const r = await financeApi.syncStripeFees()
      toast(r.updated ? `Stripe fees updated for ${r.updated} order${r.updated === 1 ? "" : "s"}` : "No fees to update yet")
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't sync", "error")
    } finally {
      setSyncing(false)
    }
  }

  if (!financeApi.available) {
    return (
      <div className={styles.page}>
        <h1 className="t-h1">Accounting</h1>
        <div className={styles.emptyState}>
          <p className="t-h3">Accounting needs Supabase connected.</p>
          <p className="t-soft">It reads your real paid orders, Stripe fees and expenses.</p>
        </div>
      </div>
    )
  }

  const shares = partners.length ? partners : [{ id: "owner", name: "Owner", share_pct: 100 }]

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div>
          <p className="t-label t-accent">Accounting</p>
          <h1 className="t-h1">Financial overview</h1>
          <p className="t-soft t-small">Sales, costs, Stripe fees, taxes and real profit from every paid VICKAR order.</p>
        </div>
        <div className={f.headActions}>
          <button type="button" className={f.ownership} onClick={() => setEditingPartners(true)} aria-label="Edit ownership">
            <span className="t-label t-soft">Ownership</span>
            {shares.map((p) => (
              <span key={p.id}>
                {p.name} <strong>{p.share_pct}%</strong>
              </span>
            ))}
          </button>
          <label className={f.period}>
            <span className="sr-only">Period</span>
            <select value={range} onChange={(e) => setRange(e.target.value as Range)}>
              {ranges.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {range === "custom" && (
        <div className={f.customRange}>
          <label>
            From <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          </label>
          <label>
            To <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </label>
        </div>
      )}

      {error && (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      )}

      {s.missingFees > 0 && (
        <div className={f.notice} role="status">
          <span>
            {s.missingFees} paid order{s.missingFees === 1 ? " doesn't" : "s don't"} have the Stripe fee yet, so profit is slightly overstated.
          </span>
          <button type="button" className="btn btn--ghost" onClick={syncFees} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync Stripe fees"}
          </button>
        </div>
      )}

      <m.ul className={f.kpis7} initial="hidden" animate="shown" transition={{ staggerChildren: stagger.items }} key={`${from}-${to}`}>
        {[
          { label: "Sales", value: cents(s.netSales), sub: `${s.orderCount} paid order${s.orderCount === 1 ? "" : "s"}`, tone: "green" },
          { label: "Orders", value: String(s.orderCount), sub: s.refundCount ? `${s.refundCount} refunded` : "Completed payments", tone: "blue" },
          { label: "Gross profit", value: cents(s.grossProfit), sub: "After direct costs", tone: "amber" },
          { label: "Stripe fees", value: cents(-s.stripeFees), sub: "Real processor fees", tone: "purple" },
          { label: "Taxes", value: cents(-s.tax), sub: "Collected, owed to the state", tone: "pink" },
          { label: "Expenses", value: cents(-s.expenses), sub: "Operating expenses", tone: "red" },
          { label: "Net profit", value: cents(s.netProfit), sub: s.netSales ? `${Math.round((s.netProfit / s.netSales) * 100)}% of sales` : "—", tone: "net" },
        ].map((k) => (
          <m.li
            key={k.label}
            className={f.kpiCard}
            data-tone={k.tone}
            variants={{ hidden: { opacity: 0, transform: "translateY(8px)" }, shown: { opacity: 1, transform: "translateY(0px)" } }}
            transition={transition.reveal}
          >
            <span className="t-label">{k.label}</span>
            <span className={f.kpiValue} data-negative={k.value.startsWith("−")}>
              {k.value}
            </span>
            <span className={f.kpiSub}>{k.sub}</span>
          </m.li>
        ))}
      </m.ul>

      <div className={f.grid3}>
        <section className={`${styles.panel} ${f.span2}`} aria-labelledby="chart-title">
          <h2 id="chart-title" className="t-h3">
            Sales & profit
          </h2>
          <SalesChart buckets={s.buckets} />
        </section>

        <section className={styles.panel} aria-labelledby="top-title">
          <h2 id="top-title" className="t-h3">
            Top products
          </h2>
          {s.topProducts.length === 0 ? (
            <p className="t-soft t-small">No sales in this period.</p>
          ) : (
            <ol className={f.top}>
              {s.topProducts.slice(0, 6).map((p, i) => (
                <li key={p.name}>
                  <span className={f.rank}>{i + 1}</span>
                  <span className={f.topName}>
                    {p.name}
                    <span className="t-small t-soft">{p.units} sold</span>
                  </span>
                  <span className={f.num}>{cents(p.revenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className={f.grid3}>
        <section className={styles.panel} aria-labelledby="breakdown-title">
          <h2 id="breakdown-title" className="t-h3">
            Profit breakdown
          </h2>
          <Breakdown s={s} />
        </section>

        <section className={`${styles.panel} ${f.span2}`} aria-labelledby="summary-title">
          <h2 id="summary-title" className="t-h3">
            Profit summary
          </h2>
          <dl className={f.summary}>
            <Row label="Gross sales" value={s.grossSales} />
            <Row label="Discounts" value={-s.discounts} />
            <Row label="Shipping charged to customers" value={s.shippingCharged} />
            <Row label="Product cost (COGS)" value={-s.cogs} />
            <Row label="Stripe fees" value={-s.stripeFees} />
            <Row label="Shipping labels paid" value={-s.shippingCosts} />
            <Row label="Gross profit" value={s.grossProfit} strong />
            <Row label="Operating expenses" value={-s.expenses} />
            <Row label="Net profit" value={s.netProfit} strong big />
            {shares.map((p) => (
              <Row key={p.id} label={`${p.name} · ${p.share_pct}%`} value={(s.netProfit * p.share_pct) / 100} soft />
            ))}
            <Row label="Taxes collected (not income — owed to the state)" value={s.tax} soft />
            {s.refundCount > 0 && <Row label={`Refunded to customers (${s.refundCount} order${s.refundCount === 1 ? "" : "s"}, excluded from sales)`} value={-s.refunds} soft />}
          </dl>
        </section>
      </div>

      <section className={styles.panel} aria-labelledby="sales-title">
        <div className={styles.panelHead}>
          <div>
            <p className="t-label t-soft">Paid orders</p>
            <h2 id="sales-title" className="t-h3">
              Recent sales
            </h2>
          </div>
          <span className="t-small">
            Net profit <strong>{cents(s.netProfit)}</strong>
          </span>
        </div>
        {orders === null ? (
          <p className="t-soft">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="t-soft t-small">No paid orders in this period.</p>
        ) : (
          <div className={f.tableWrap}>
            <table className={f.table}>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Order</th>
                  <th scope="col">Customer</th>
                  <th scope="col" className={f.num}>Items</th>
                  <th scope="col" className={f.num}>Total</th>
                  <th scope="col" className={f.num}>Discount</th>
                  <th scope="col" className={f.num}>Shipping</th>
                  <th scope="col" className={f.num}>Tax</th>
                  <th scope="col" className={f.num}>Stripe fee</th>
                  <th scope="col" className={f.num}>COGS</th>
                  <th scope="col" className={f.num}>Profit</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 50).map((o) => {
                  const refunded = o.status === "refunded"
                  return (
                    <tr key={o.id} data-refunded={refunded}>
                      <td className={f.nowrap}>{new Date(o.paid_at ?? o.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}</td>
                      <td className={f.mono}>
                        <a href={`#/admin/orders/${o.id}`} className={f.link}>
                          {o.number}
                        </a>
                        {refunded && <span className={f.refundTag}>Refunded</span>}
                      </td>
                      <td>{o.customer_name}</td>
                      <td className={f.num}>{o.items.reduce((n, i) => n + i.qty, 0)}</td>
                      <td className={f.num}>{cents(o.total)}</td>
                      <td className={f.num}>{cents(-o.discount)}</td>
                      <td className={f.num}>{cents(o.shipping)}</td>
                      <td className={f.num}>{cents(-o.tax)}</td>
                      <td className={f.num}>{o.stripe_fee == null ? <span className={f.pending}>pending</span> : cents(-o.stripe_fee)}</td>
                      <td className={f.num}>{cents(-o.cogs)}</td>
                      <td className={`${f.num} ${f.strong}`}>{cents(refunded ? -(o.stripe_fee ?? 0) - o.shipping_cost : orderProfit(o))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Expenses expenses={expenses} onChange={load} />

      <AnimatePresence>
        {editingPartners && (
          <PartnersDialog
            partners={partners}
            onClose={() => setEditingPartners(false)}
            onSaved={async () => {
              setEditingPartners(false)
              toast("Ownership updated")
              await load()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* -------------------------------------------------------------------------------------------- */

type Summary = ReturnType<typeof summarize>

function summarize(orders: SaleOrder[], expenses: Expense[]) {
  const active = orders.filter((o) => o.status !== "refunded")
  const refunded = orders.filter((o) => o.status === "refunded")
  const sum = (list: SaleOrder[], k: (o: SaleOrder) => number) => list.reduce((n, o) => n + k(o), 0)

  const grossSales = sum(active, (o) => o.subtotal)
  const discounts = sum(active, (o) => o.discount)
  const netSales = grossSales - discounts
  const shippingCharged = sum(active, (o) => o.shipping)
  const tax = sum(active, (o) => o.tax)
  const cogs = sum(active, (o) => o.cogs)
  // Stripe keeps its fee and labels were already bought, even when an order is refunded
  const stripeFees = sum(orders, (o) => o.stripe_fee ?? 0)
  const shippingCosts = sum(orders, (o) => o.shipping_cost)
  const grossProfit = netSales + shippingCharged - cogs - stripeFees - shippingCosts
  const expensesTotal = expenses.reduce((n, e) => n + e.amount, 0)
  const netProfit = grossProfit - expensesTotal

  // Top products by revenue
  const byProduct = new Map<string, { name: string; units: number; revenue: number }>()
  for (const o of active)
    for (const i of o.items) {
      const cur = byProduct.get(i.productId) ?? { name: i.name, units: 0, revenue: 0 }
      cur.units += i.qty
      cur.revenue += i.qty * i.unitPrice
      byProduct.set(i.productId, cur)
    }

  // Daily buckets (monthly when the range is long)
  const dates = orders.map((o) => (o.paid_at ?? o.created_at).slice(0, 10)).concat(expenses.map((e) => e.expense_date))
  const span = dates.length ? (Date.parse(dates.reduce((a, b) => (a > b ? a : b))) - Date.parse(dates.reduce((a, b) => (a < b ? a : b)))) / 864e5 : 0
  const key = (d: string) => (span > 92 ? d.slice(0, 7) : d)
  const buckets = new Map<string, { sales: number; profit: number }>()
  for (const o of orders) {
    const k = key((o.paid_at ?? o.created_at).slice(0, 10))
    const b = buckets.get(k) ?? { sales: 0, profit: 0 }
    if (o.status !== "refunded") b.sales += o.subtotal - o.discount
    b.profit += o.status === "refunded" ? -(o.stripe_fee ?? 0) - o.shipping_cost : orderProfit(o)
    buckets.set(k, b)
  }
  for (const e of expenses) {
    const k = key(e.expense_date)
    const b = buckets.get(k) ?? { sales: 0, profit: 0 }
    b.profit -= e.amount
    buckets.set(k, b)
  }

  return {
    orderCount: active.length,
    refundCount: refunded.length,
    refunds: sum(refunded, (o) => o.total),
    grossSales,
    discounts,
    netSales,
    shippingCharged,
    tax,
    cogs,
    stripeFees,
    shippingCosts,
    grossProfit,
    expenses: expensesTotal,
    netProfit,
    missingFees: orders.filter((o) => o.stripe_fee == null).length,
    topProducts: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue),
    buckets: [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, v]) => ({ label, ...v })),
  }
}

function Row({ label, value, strong, big, soft }: { label: string; value: number; strong?: boolean; big?: boolean; soft?: boolean }) {
  return (
    <div className={f.row} data-strong={strong} data-big={big} data-soft={soft}>
      <dt>{label}</dt>
      <dd data-negative={value < -0.004}>{cents(value)}</dd>
    </div>
  )
}

/** Bars = sales, line = profit (after expenses). Accessible: summarised as a data table for screen readers. */
function SalesChart({ buckets }: { buckets: { label: string; sales: number; profit: number }[] }) {
  const reduced = useReducedMotion()
  if (buckets.length === 0) return <p className="t-soft t-small">No activity in this period.</p>
  const W = 640
  const H = 220
  const pad = { l: 8, r: 8, t: 12, b: 24 }
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.sales, b.profit)))
  const min = Math.min(0, ...buckets.map((b) => b.profit))
  const y = (v: number) => pad.t + ((max - v) / (max - min)) * (H - pad.t - pad.b)
  const bw = (W - pad.l - pad.r) / buckets.length
  const x = (i: number) => pad.l + i * bw + bw / 2
  const line = buckets.map((b, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(b.profit).toFixed(1)}`).join(" ")
  const fmtLabel = (l: string) =>
    l.length === 7
      ? new Date(`${l}-15T12:00:00`).toLocaleDateString("en-US", { month: "short" })
      : new Date(`${l}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  const every = Math.ceil(buckets.length / 8)

  return (
    <figure className={f.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sales and profit over the selected period">
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className={f.axis} />
        {buckets.map((b, i) => (
          <m.rect
            key={b.label}
            x={x(i) - Math.min(28, bw * 0.6) / 2}
            width={Math.min(28, bw * 0.6)}
            y={y(b.sales)}
            height={Math.max(0, y(0) - y(b.sales))}
            rx={3}
            className={f.bar}
            style={{ originY: 1 }}
            initial={reduced ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.6, delay: i * 0.02, ease: [0.22, 1, 0.36, 1] }}
          >
            <title>{`${fmtLabel(b.label)}: sales ${cents(b.sales)}, profit ${cents(b.profit)}`}</title>
          </m.rect>
        ))}
        <m.path
          d={line}
          className={f.profitLine}
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
        />
        {buckets.map((b, i) => (
          <circle key={b.label} cx={x(i)} cy={y(b.profit)} r={3} className={f.profitDot} />
        ))}
        {buckets.map((b, i) =>
          i % every === 0 ? (
            <text key={b.label} x={x(i)} y={H - 6} textAnchor="middle" className={f.tick}>
              {fmtLabel(b.label)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className={f.legend}>
        <span data-key="sales">Sales</span>
        <span data-key="profit">Profit after expenses</span>
      </figcaption>
      <table className="sr-only">
        <caption>Sales and profit by period</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>Sales</th>
            <th>Profit</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.label}>
              <td>{b.label}</td>
              <td>{cents(b.sales)}</td>
              <td>{cents(b.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/** Where each sales dollar went: product cost, Stripe, shipping labels, expenses, and what's left. */
function Breakdown({ s }: { s: Summary }) {
  const reduced = useReducedMotion()
  const parts = [
    { key: "cogs", label: "Product cost", value: s.cogs },
    { key: "stripe", label: "Stripe fees", value: s.stripeFees },
    { key: "shipping", label: "Shipping labels", value: s.shippingCosts },
    { key: "expenses", label: "Expenses", value: s.expenses },
    { key: "net", label: "Net profit", value: Math.max(0, s.netProfit) },
  ].filter((p) => p.value > 0.004)
  const total = parts.reduce((n, p) => n + p.value, 0)
  if (total === 0) return <p className="t-soft t-small">Nothing to break down yet.</p>
  const R = 52
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className={f.donutWrap}>
      <svg viewBox="0 0 140 140" className={f.donut} role="img" aria-label={`Net profit ${cents(s.netProfit)}`}>
        <circle cx="70" cy="70" r={R} className={f.donutTrack} />
        {parts.map((p) => {
          const len = (p.value / total) * C
          const el = (
            <m.circle
              key={p.key}
              cx="70"
              cy="70"
              r={R}
              data-key={p.key}
              className={f.donutSeg}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            />
          )
          offset += len
          return el
        })}
        <text x="70" y="68" textAnchor="middle" className={f.donutValue}>
          {`${s.netProfit < 0 ? "−" : ""}${formatPrice(Math.round(Math.abs(s.netProfit)))}`}
        </text>
        <text x="70" y="86" textAnchor="middle" className={f.donutLabel}>
          Net profit
        </text>
      </svg>
      <ul className={f.donutLegend}>
        {parts.map((p) => (
          <li key={p.key} data-key={p.key}>
            <span>{p.label}</span>
            <span className={f.num}>{cents(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------------------------------------- */

function Expenses({ expenses, onChange }: { expenses: Expense[]; onChange: () => Promise<void> }) {
  const toast = useToast()
  const confirm = useConfirm()
  const reduced = useReducedMotion()
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [category, setCategory] = useState("Advertising")
  const [vendor, setVendor] = useState("")
  const [date, setDate] = useState(localDate(new Date()))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const a = Number(amount.replace(/[$,\s]/g, ""))
    if (!description.trim()) return setError("Describe the expense.")
    if (!(a > 0)) return setError("Enter an amount greater than 0.")
    setError(null)
    setBusy(true)
    try {
      await financeApi.addExpense({ expense_date: date, description: description.trim(), category, vendor: vendor.trim(), amount: Math.round(a * 100) / 100 })
      setDescription("")
      setAmount("")
      setVendor("")
      toast("Expense added")
      await onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the expense.")
    } finally {
      setBusy(false)
    }
  }

  const remove = async (x: Expense) => {
    const ok = await confirm({ title: "Delete this expense?", body: `${x.description} · ${cents(x.amount)}`, action: "Delete expense", danger: true })
    if (!ok) return
    await financeApi.deleteExpense(x.id)
    toast("Expense deleted")
    await onChange()
  }

  const total = expenses.reduce((n, x) => n + x.amount, 0)

  return (
    <section className={styles.panel} aria-labelledby="exp-title">
      <div className={styles.panelHead}>
        <h2 id="exp-title" className="t-h3">
          Operating expenses
        </h2>
        <span className="t-small">
          This period <strong>{cents(total)}</strong>
        </span>
      </div>
      <form className={f.expenseForm} onSubmit={add} noValidate>
        <label className={f.inlineField}>
          <span className="sr-only">Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (e.g. Instagram ads)" />
        </label>
        <label className={f.inlineField}>
          <span className="sr-only">Amount</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" inputMode="decimal" />
        </label>
        <label className={f.inlineField}>
          <span className="sr-only">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {expenseCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className={f.inlineField}>
          <span className="sr-only">Vendor</span>
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor (optional)" />
        </label>
        <label className={f.inlineField}>
          <span className="sr-only">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Adding…" : "Add expense"}
        </button>
      </form>
      {error && (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
      {expenses.length === 0 ? (
        <p className="t-soft t-small">No expenses in this period.</p>
      ) : (
        <div className={f.tableWrap}>
          <table className={f.table}>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Description</th>
                <th scope="col">Category</th>
                <th scope="col">Vendor</th>
                <th scope="col" className={f.num}>Amount</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {expenses.map((x) => (
                  <m.tr key={x.id} layout={!reduced} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: transition.exit }}>
                    <td className={f.nowrap}>{new Date(`${x.expense_date}T12:00:00`).toLocaleDateString("en-US", { dateStyle: "medium" })}</td>
                    <td>{x.description}</td>
                    <td className="t-small t-soft">{x.category}</td>
                    <td className="t-small t-soft">{x.vendor ?? "—"}</td>
                    <td className={f.num}>{cents(x.amount)}</td>
                    <td className={f.actions}>
                      <button type="button" className={f.deleteBtn} onClick={() => remove(x)}>
                        Delete
                      </button>
                    </td>
                  </m.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function PartnersDialog({ partners, onClose, onSaved }: { partners: Partner[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [list, setList] = useState(partners.length ? partners.map((p) => ({ name: p.name, share: String(p.share_pct) })) : [{ name: "Owner", share: "100" }])
  const [error, setError] = useState<string | null>(null)
  const total = list.reduce((n, p) => n + (Number(p.share) || 0), 0)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (list.some((p) => !p.name.trim() || !(Number(p.share) > 0))) return setError("Every partner needs a name and a percentage above 0.")
    if (Math.abs(total - 100) > 0.001) return setError(`Percentages must add up to 100% (now ${total}%).`)
    try {
      await financeApi.savePartners(list.map((p) => ({ name: p.name.trim(), share_pct: Number(p.share) })))
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.")
    }
  }

  return (
    <div className={styles.modalRoot}>
      <m.div className={styles.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <m.form
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="partners-title"
        onSubmit={save}
        noValidate
        initial={{ opacity: 0, transform: "scale(0.96)" }}
        animate={{ opacity: 1, transform: "scale(1)" }}
        exit={{ opacity: 0, transition: transition.exit }}
      >
        <h2 id="partners-title" className="t-h3">
          Ownership
        </h2>
        <p className="t-soft t-small">Each partner's share of net profit is shown in the Profit summary.</p>
        <ul className={styles.repeat}>
          {list.map((p, i) => (
            <li key={i}>
              <input aria-label={`Partner ${i + 1} name`} value={p.name} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input
                aria-label={`Partner ${i + 1} percentage`}
                inputMode="decimal"
                value={p.share}
                style={{ maxWidth: "6rem" }}
                onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, share: e.target.value } : x)))}
              />
              <span className="t-small t-soft">%</span>
              <button type="button" className={styles.iconButton} aria-label={`Remove partner ${i + 1}`} disabled={list.length === 1} onClick={() => setList(list.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn--ghost" onClick={() => setList([...list, { name: "", share: "" }])}>
          Add partner
        </button>
        <p className="t-small" data-ok={Math.abs(total - 100) < 0.001}>
          Total: <strong>{total}%</strong>
        </p>
        {error && (
          <p className={styles.fieldError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.modalActions}>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Save ownership
          </button>
        </div>
      </m.form>
    </div>
  )
}
