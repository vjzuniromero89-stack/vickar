import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useMemo, useState } from "react"
import { ProductVisual } from "../components/product/ProductVisual"
import { Icon } from "../components/ui/Icon"
import { formatMoney, formatPrice, type Product } from "../data/catalog"
import { spring, transition } from "../motion/tokens"
import { useCatalog } from "../state/CatalogContext"
import { Pill, Switch, useConfirm, useToast } from "./ui"
import styles from "./admin.module.css"

type StatusFilter = "all" | "live" | "draft"

export function ProductsList() {
  const { products, categories, categoryLabel, saveProduct, deleteProduct } = useCatalog()
  const toast = useToast()
  const confirm = useConfirm()
  const reduced = useReducedMotion()
  const [q, setQ] = useState("")
  const [cat, setCat] = useState("all")
  const [status, setStatus] = useState<StatusFilter>("all")

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return products.filter(
      (p) =>
        (cat === "all" || p.category === cat) &&
        (status === "all" || (status === "live") === p.published) &&
        words.every((w) => `${p.name} ${p.id}`.toLowerCase().includes(w)),
    )
  }, [products, q, cat, status])

  const togglePublished = async (p: Product, published: boolean) => {
    try {
      await saveProduct({ ...p, published })
      toast(published ? `${p.name} is live` : `${p.name} hidden from the store`)
    } catch {
      toast("Couldn't update the product", "error")
    }
  }

  const onDelete = async (p: Product) => {
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      body: "This removes it from the store permanently. Past orders keep their copy of the details.",
      action: "Delete product",
      danger: true,
    })
    if (!ok) return
    try {
      await deleteProduct(p.id)
      toast(`${p.name} deleted`)
    } catch {
      toast("Couldn't delete the product", "error")
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div>
          <p className="t-label t-accent">Catalogue</p>
          <h1 className="t-h1">Products</h1>
        </div>
        <a className="btn btn--primary" href="#/admin/products/new">
          <Icon name="plus" size={18} /> New product
        </a>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Icon name="search" size={18} />
          <span className="sr-only">Search products</span>
          <input type="search" placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className={styles.selectLabel}>
          <span className="sr-only">Category</span>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.selectLabel}>
          <span className="sr-only">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="all">All statuses</option>
            <option value="live">Live</option>
            <option value="draft">Draft</option>
          </select>
        </label>
      </div>

      <p className="sr-only" role="status">
        {list.length} products
      </p>

      {list.length === 0 ? (
        <div className={styles.emptyState}>
          <p className="t-h3">No products match.</p>
          <p className="t-soft">Try another search, or create a new product.</p>
        </div>
      ) : (
        <ul className={styles.table}>
          <li className={styles.tableHead} aria-hidden="true">
            <span />
            <span>Product</span>
            <span>Category</span>
            <span>Price</span>
            <span>Stock</span>
            <span>Live</span>
            <span />
          </li>
          <AnimatePresence initial={false}>
            {list.map((p) => (
              <m.li
                key={p.id}
                className={styles.row}
                layout={!reduced}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: transition.exit }}
                transition={spring.layout}
              >
                <span className={styles.thumb} data-photo={Boolean(p.image)}>
                  <ProductVisual product={p} color={p.swatches[0]?.hex ?? "#888"} />
                </span>
                <span className={styles.rowName}>
                  <a href={`#/admin/products/${p.id}`}>{p.name}</a>
                  <span className="t-small t-soft">
                    {p.sku ? `${p.sku} · ` : ""}
                    {p.swatches.length} colour{p.swatches.length === 1 ? "" : "s"}
                    {p.badge ? ` · ${p.badge}` : ""}
                  </span>
                </span>
                <span className={`t-small ${styles.cellCat}`}>{categoryLabel(p.category)}</span>
                <span className={styles.priceCell}>
                  {formatPrice(p.price)}
                  <span className="t-small t-soft">{p.unitCost ? `cost ${formatMoney(p.unitCost)}` : "no cost"}</span>
                </span>
                <span>
                  {p.stock == null ? (
                    <span className="t-soft t-small">∞</span>
                  ) : (
                    <Pill tone={p.stock === 0 ? "error" : p.stock <= 5 ? "warn" : "muted"}>{p.stock}</Pill>
                  )}
                </span>
                <span>
                  <Switch checked={p.published} onChange={(v) => togglePublished(p, v)} label={`Show ${p.name} in the store`} />
                </span>
                <span className={styles.rowActions}>
                  <a href={`#/admin/products/${p.id}`} className={styles.iconButton} aria-label={`Edit ${p.name}`}>
                    <Icon name="edit" size={18} />
                  </a>
                  <button type="button" className={styles.iconButton} onClick={() => onDelete(p)} aria-label={`Delete ${p.name}`}>
                    <Icon name="trash" size={18} />
                  </button>
                </span>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
