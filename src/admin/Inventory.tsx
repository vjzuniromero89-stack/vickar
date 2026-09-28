import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { formatMoney as formatPrice } from "../data/catalog"
import { stagger, transition } from "../motion/tokens"
import { useCatalog } from "../state/CatalogContext"
import { financeApi, movementLabels, type Movement, type MovementType } from "./financeApi"
import { useConfirm, useToast } from "./ui"
import styles from "./admin.module.css"
import f from "./finance.module.css"

const manualTypes: MovementType[] = ["opening_stock", "received", "return", "other_out", "adjustment"]
const sign = (t: MovementType) => (t === "other_out" || t === "sale" ? -1 : 1)

/**
 * Inventory accounting: every product keeps a permanent movement history.
 * Opening stock + receipts + returns + adjustments − sales − other outputs = current stock.
 */
export function Inventory() {
  const { products, reload } = useCatalog()
  const toast = useToast()
  const confirm = useConfirm()
  const reduced = useReducedMotion()
  const [movements, setMovements] = useState<Movement[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const [editing, setEditing] = useState<Movement | null>(null)

  const load = useCallback(async () => {
    try {
      setMovements(await financeApi.movements())
    } catch (e) {
      setError(
        e instanceof Error && /relation .*inventory_movements|does not exist/i.test(e.message)
          ? "Inventory isn't installed yet. Run supabase/migrations/004_inventory_accounting.sql in Supabase → SQL Editor."
          : e instanceof Error
            ? e.message
            : "Couldn't load inventory.",
      )
    }
  }, [])

  useEffect(() => {
    if (financeApi.available) void load()
  }, [load])

  const rows = useMemo(() => {
    const list = movements ?? []
    return products.map((p) => {
      const mine = list.filter((m) => m.product_id === p.id)
      const sum = (t: MovementType) => mine.filter((m) => m.type === t).reduce((s, m) => s + m.quantity, 0)
      // Same rule as the database trigger: stock = sum of movements (null when untracked)
      const current = mine.length ? mine.reduce((n, m) => n + m.quantity, 0) : null
      return {
        product: p,
        tracked: mine.length > 0,
        opening: sum("opening_stock"),
        received: sum("received"),
        sales: -sum("sale"),
        returns: sum("return"),
        otherOut: -sum("other_out"),
        adjustments: sum("adjustment"),
        current,
        value: Math.max(0, current ?? 0) * (p.unitCost ?? 0),
      }
    })
  }, [products, movements])

  const totals = rows.reduce(
    (t, r) => ({
      opening: t.opening + r.opening,
      received: t.received + r.received,
      sales: t.sales + r.sales,
      returns: t.returns + r.returns,
      otherOut: t.otherOut + r.otherOut,
      current: t.current + Math.max(0, r.current ?? 0),
      value: t.value + r.value,
    }),
    { opening: 0, received: 0, sales: 0, returns: 0, otherOut: 0, current: 0, value: 0 },
  )

  const refresh = async () => {
    await Promise.all([load(), reload()])
  }

  const onDelete = async (mv: Movement) => {
    const ok = await confirm({
      title: "Delete this movement?",
      body: `${movementLabels[mv.type]} of ${Math.abs(mv.quantity)} × ${mv.product_name}. The product's stock will be recalculated.`,
      action: "Delete movement",
      danger: true,
    })
    if (!ok) return
    try {
      await financeApi.deleteMovement(mv.id)
      toast("Movement deleted")
      await refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete", "error")
    }
  }

  if (!financeApi.available) {
    return (
      <div className={styles.page}>
        <h1 className="t-h1">Inventory</h1>
        <div className={styles.emptyState}>
          <p className="t-h3">Inventory needs Supabase connected.</p>
          <p className="t-soft">Movements live in the database so every unit keeps its history.</p>
        </div>
      </div>
    )
  }

  const history = (movements ?? []).filter((m) => !filter || m.product_id === filter)

  return (
    <div className={styles.page}>
      <header className={f.hero}>
        <div>
          <p className="t-label">Inventory accounting</p>
          <h1 className={f.heroTitle}>Inventory</h1>
          <p className={f.heroText}>
            Every product keeps a permanent movement history. Opening stock + receipts + returns + adjustments − sales − other outputs = current stock.
          </p>
        </div>
        <div className={f.heroFigure}>
          <span className="t-label">Inventory value at cost</span>
          <strong>{formatPrice(totals.value)}</strong>
        </div>
      </header>

      {error && (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      )}

      <m.ul className={f.kpis6} initial="hidden" animate="shown" transition={{ staggerChildren: stagger.items }}>
        {[
          { label: "Opening stock", value: `${totals.opening}` },
          { label: "Received", value: `+${totals.received}` },
          { label: "Sales", value: `−${totals.sales}` },
          { label: "Returns", value: `+${totals.returns}` },
          { label: "Other out", value: `−${totals.otherOut}` },
          { label: "Current stock", value: `${totals.current}`, strong: true },
        ].map((k) => (
          <m.li
            key={k.label}
            className={f.kpi}
            data-strong={k.strong}
            variants={{ hidden: { opacity: 0, transform: "translateY(8px)" }, shown: { opacity: 1, transform: "translateY(0px)" } }}
            transition={transition.reveal}
          >
            <span className="t-label t-soft">{k.label}</span>
            <span className={f.kpiValue}>{k.value}</span>
          </m.li>
        ))}
      </m.ul>

      <section className={styles.panel} aria-labelledby="inv-by-product">
        <div className={styles.panelHead}>
          <div>
            <p className="t-label t-soft">Product ledger</p>
            <h2 id="inv-by-product" className="t-h3">
              Inventory by product
            </h2>
          </div>
          <span className="t-small t-soft">{products.length} products</span>
        </div>
        <div className={f.tableWrap}>
          <table className={f.table}>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">SKU</th>
                <th scope="col" className={f.num}>Opening</th>
                <th scope="col" className={f.num}>Received</th>
                <th scope="col" className={f.num}>Sales</th>
                <th scope="col" className={f.num}>Returns</th>
                <th scope="col" className={f.num}>Other out</th>
                <th scope="col" className={f.num}>Adj.</th>
                <th scope="col" className={f.num}>Current</th>
                <th scope="col" className={f.num}>Unit cost</th>
                <th scope="col" className={f.num}>Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const alert = r.product.lowStockAlert ?? 2
                const tone = !r.tracked ? "muted" : (r.current ?? 0) <= 0 ? "error" : (r.current ?? 0) <= alert ? "warn" : "ok"
                return (
                  <tr key={r.product.id}>
                    <td>
                      <a href={`#/admin/products/${r.product.id}`} className={f.link}>
                        {r.product.name}
                      </a>
                    </td>
                    <td className={f.mono}>{r.product.sku || <span className="t-soft">—</span>}</td>
                    <td className={f.num}>{r.opening}</td>
                    <td className={`${f.num} ${f.plus}`}>+{r.received}</td>
                    <td className={`${f.num} ${f.minus}`}>−{r.sales}</td>
                    <td className={`${f.num} ${f.plus}`}>+{r.returns}</td>
                    <td className={`${f.num} ${f.minus}`}>−{r.otherOut}</td>
                    <td className={f.num}>{r.adjustments > 0 ? `+${r.adjustments}` : r.adjustments}</td>
                    <td className={f.num}>
                      <span className={styles.pill} data-tone={tone}>
                        {r.tracked ? r.current : "Not tracked"}
                      </span>
                    </td>
                    <td className={f.num}>{r.product.unitCost ? formatPrice(r.product.unitCost) : <span className="t-soft">—</span>}</td>
                    <td className={f.num}>{formatPrice(r.value)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <MovementForm
        products={products.map((p) => ({ id: p.id, name: p.name, sku: p.sku, unitCost: p.unitCost ?? 0, stock: p.stock ?? null }))}
        trackedIds={new Set((movements ?? []).map((m) => m.product_id))}
        onPosted={async (label) => {
          toast(label)
          await refresh()
        }}
      />

      <section className={styles.panel} aria-labelledby="inv-history">
        <div className={styles.panelHead}>
          <div>
            <p className="t-label t-soft">Inventory entries</p>
            <h2 id="inv-history" className="t-h3">
              Movement history
            </h2>
          </div>
          <label className={styles.selectLabel}>
            <span className="sr-only">Filter by product</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {movements === null ? (
          <p className="t-soft">Loading…</p>
        ) : history.length === 0 ? (
          <p className="t-soft t-small">No movements yet. Start with an opening stock count above.</p>
        ) : (
          <div className={f.tableWrap}>
            <table className={f.table}>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Product</th>
                  <th scope="col">SKU</th>
                  <th scope="col">Movement</th>
                  <th scope="col" className={f.num}>Qty</th>
                  <th scope="col" className={f.num}>Unit cost</th>
                  <th scope="col">Reason / reference</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {history.map((mv) => (
                    <m.tr
                      key={mv.id}
                      layout={!reduced}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: transition.exit }}
                    >
                      <td className={f.nowrap}>{new Date(mv.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
                      <td>{mv.product_name}</td>
                      <td className={f.mono}>{mv.sku ?? "—"}</td>
                      <td>
                        <span className={f.type} data-type={mv.type}>
                          {movementLabels[mv.type]}
                        </span>
                      </td>
                      <td className={`${f.num} ${mv.quantity < 0 ? f.minus : f.plus}`}>{mv.quantity > 0 ? `+${mv.quantity}` : `−${Math.abs(mv.quantity)}`}</td>
                      <td className={f.num}>{mv.unit_cost ? formatPrice(mv.unit_cost) : "—"}</td>
                      <td className="t-small">
                        {mv.order_id ? (
                          <a href={`#/admin/orders/${mv.order_id}`} className={f.link}>
                            {mv.reason ?? "Order"}
                          </a>
                        ) : (
                          (mv.reason ?? <span className="t-soft">—</span>)
                        )}
                      </td>
                      <td className={f.actions}>
                        {mv.type === "sale" ? (
                          <span className="t-small t-soft">From order</span>
                        ) : (
                          <>
                            <button type="button" className={styles.textButton} onClick={() => setEditing(mv)}>
                              Edit
                            </button>
                            <button type="button" className={f.deleteBtn} onClick={() => onDelete(mv)}>
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </m.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AnimatePresence>
        {editing && (
          <EditMovement
            key={editing.id}
            movement={editing}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null)
              toast("Movement updated")
              await refresh()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

type ProductOption = { id: string; name: string; sku?: string; unitCost: number; stock: number | null }

function MovementForm({
  products,
  trackedIds,
  onPosted,
}: {
  products: ProductOption[]
  trackedIds: Set<string>
  onPosted: (label: string) => Promise<void>
}) {
  const [productId, setProductId] = useState("")
  const [type, setType] = useState<MovementType>("opening_stock")
  const [qty, setQty] = useState("")
  const [cost, setCost] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const product = products.find((p) => p.id === productId)
  const needsCost = type === "opening_stock" || type === "received"

  useEffect(() => {
    if (product) setCost(product.unitCost ? String(product.unitCost) : "")
  }, [product])

  // Opening stock is for the first count only
  useEffect(() => {
    if (product && trackedIds.has(product.id) && type === "opening_stock") setType("received")
  }, [product, trackedIds, type])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!product) return setError("Choose a product.")
    const q = Number(qty)
    if (!Number.isInteger(q) || q === 0 || (type !== "adjustment" && q < 0))
      return setError(type === "adjustment" ? "Enter a whole number, e.g. 3 or -2." : "Enter a whole number greater than 0.")
    if (type === "opening_stock" && trackedIds.has(product.id))
      return setError("This product already has an opening count. Use Received for new stock, or Adjustment to correct a count.")
    if ((type === "other_out" || type === "adjustment") && !reason.trim()) return setError("Add a reason (e.g. damaged, lost, count correction).")
    const c = needsCost ? Number(cost || 0) : product.unitCost
    if (needsCost && (Number.isNaN(c) || c < 0)) return setError("Unit cost must be 0 or more.")

    setBusy(true)
    try {
      await financeApi.addMovement({
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        type,
        quantity: sign(type) * Math.abs(q) * (type === "adjustment" ? Math.sign(q) : 1),
        unit_cost: c,
        reason: reason.trim(),
      })
      setQty("")
      setReason("")
      await onPosted(`${movementLabels[type]} posted: ${Math.abs(q)} × ${product.name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post the movement.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={styles.panel} onSubmit={submit} noValidate aria-labelledby="inv-add">
      <h2 id="inv-add" className="t-h3">
        Add inventory movement
      </h2>
      <p className={styles.hint}>
        Use <strong>Opening stock</strong> only for a product's first physical count. Use <strong>Received</strong> for later purchases.
        Sales are recorded automatically when an order is paid.
      </p>
      <div className={styles.formRow}>
        <div className={styles.field}>
          <label htmlFor="mv-product">Product</label>
          <select id="mv-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Select product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.sku ? ` · ${p.sku}` : ""}
                {p.stock != null ? ` (${p.stock} in stock)` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="mv-type">Movement</label>
          <select id="mv-type" value={type} onChange={(e) => setType(e.target.value as MovementType)}>
            {manualTypes.map((t) => (
              <option key={t} value={t} disabled={t === "opening_stock" && !!product && trackedIds.has(product.id)}>
                {movementLabels[t]}
                {t === "other_out" ? " (damaged, lost, samples)" : t === "adjustment" ? " (+/− count correction)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={needsCost ? styles.formRow3 : styles.formRow}>
        <div className={styles.field}>
          <label htmlFor="mv-qty">Quantity</label>
          <input id="mv-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={type === "adjustment" ? "e.g. -2" : "e.g. 10"} />
        </div>
        {needsCost && (
          <div className={styles.field}>
            <label htmlFor="mv-cost">Unit cost (USD)</label>
            <input id="mv-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
          </div>
        )}
        <div className={styles.field}>
          <label htmlFor="mv-reason">Reason / reference</label>
          <input
            id="mv-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={type === "received" ? "Supplier invoice #" : type === "other_out" ? "Damaged / lost / sample" : "Optional"}
          />
        </div>
      </div>
      {error && (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={`btn btn--primary ${f.fullButton}`} disabled={busy}>
        {busy ? "Posting…" : "Post movement"}
      </button>
    </form>
  )
}

function EditMovement({ movement, onClose, onSaved }: { movement: Movement; onClose: () => void; onSaved: () => Promise<void> }) {
  const [qty, setQty] = useState(String(Math.abs(movement.quantity)))
  const [cost, setCost] = useState(String(movement.unit_cost || ""))
  const [reason, setReason] = useState(movement.reason ?? "")
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const q = Number(qty)
    if (!Number.isInteger(q) || q === 0 || (movement.type !== "adjustment" && q < 0)) return setError("Enter a whole number greater than 0.")
    const signed = movement.type === "adjustment" ? q : sign(movement.type) * Math.abs(q)
    try {
      await financeApi.updateMovement(movement.id, { quantity: signed, unit_cost: Number(cost || 0), reason: reason.trim() || null })
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
        aria-labelledby="edit-mv-title"
        onSubmit={submit}
        noValidate
        initial={{ opacity: 0, transform: "scale(0.96)" }}
        animate={{ opacity: 1, transform: "scale(1)" }}
        exit={{ opacity: 0, transition: transition.exit }}
      >
        <h2 id="edit-mv-title" className="t-h3">
          Edit {movementLabels[movement.type].toLowerCase()} · {movement.product_name}
        </h2>
        <div className={styles.formRow}>
          <div className={styles.field}>
            <label htmlFor="em-qty">Quantity</label>
            <input id="em-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </div>
          <div className={styles.field}>
            <label htmlFor="em-cost">Unit cost</label>
            <input id="em-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="em-reason">Reason / reference</label>
          <input id="em-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
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
            Save
          </button>
        </div>
      </m.form>
    </div>
  )
}
