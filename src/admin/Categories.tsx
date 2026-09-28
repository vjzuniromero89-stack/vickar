import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useState, type FormEvent } from "react"
import { ProductArt } from "../components/product/ProductArt"
import { Icon } from "../components/ui/Icon"
import { artKinds, type Category } from "../data/catalog"
import { spring, transition } from "../motion/tokens"
import { makeId, useCatalog } from "../state/CatalogContext"
import { useConfirm, useToast } from "./ui"
import styles from "./admin.module.css"

const blank: Category = { id: "", label: "", headline: ["", ""], pitch: "", art: "box", spec: "" }

/** Categories drive the store menu, filters and one hero chapter each. */
export function Categories() {
  const { categories, products, saveCategory, deleteCategory } = useCatalog()
  const [editing, setEditing] = useState<Category | null>(null)
  const toast = useToast()
  const confirm = useConfirm()
  const reduced = useReducedMotion()

  const count = (id: string) => products.filter((p) => p.category === id).length

  const onDelete = async (c: Category) => {
    if (count(c.id) > 0) {
      toast(`Move or delete the ${count(c.id)} products in “${c.label}” first`, "error")
      return
    }
    const ok = await confirm({ title: `Delete “${c.label}”?`, body: "It will disappear from the store menu and filters.", action: "Delete category", danger: true })
    if (!ok) return
    await deleteCategory(c.id)
    toast(`“${c.label}” deleted`)
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div>
          <p className="t-label t-accent">Catalogue</p>
          <h1 className="t-h1">Categories</h1>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setEditing({ ...blank })}>
          <Icon name="plus" size={18} /> New category
        </button>
      </header>

      <AnimatePresence initial={false}>
        {editing && (
          <CategoryForm
            key={editing.id || "new"}
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={async (c) => {
              const cat = { ...c, id: c.id || makeId(c.label, categories.map((x) => x.id)) }
              await saveCategory(cat)
              toast(`“${cat.label}” saved`)
              setEditing(null)
            }}
          />
        )}
      </AnimatePresence>

      <ul className={styles.catGrid}>
        <AnimatePresence initial={false}>
          {categories.map((c) => (
            <m.li
              key={c.id}
              className={styles.catCard}
              layout={!reduced}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: transition.exit }}
              transition={spring.layout}
            >
              <span className={styles.catArt}>
                <ProductArt kind={c.art} color="#ff7a45" materialize={0.3} draw />
              </span>
              <div className={styles.catInfo}>
                <p className={styles.catName}>{c.label}</p>
                <p className="t-small t-soft">
                  {count(c.id)} product{count(c.id) === 1 ? "" : "s"} · {c.headline.filter(Boolean).join(" ")}
                </p>
              </div>
              <div className={styles.rowActions}>
                <button type="button" className={styles.iconButton} onClick={() => setEditing(c)} aria-label={`Edit ${c.label}`}>
                  <Icon name="edit" size={18} />
                </button>
                <button type="button" className={styles.iconButton} onClick={() => onDelete(c)} aria-label={`Delete ${c.label}`}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}

function CategoryForm({ initial, onSave, onCancel }: { initial: Category; onSave: (c: Category) => Promise<void>; onCancel: () => void }) {
  const [c, setC] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!c.label.trim()) {
      setError("Give the category a name.")
      document.getElementById("cf-label")?.focus()
      return
    }
    setBusy(true)
    try {
      await onSave({ ...c, label: c.label.trim() })
    } catch {
      setError("Couldn't save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <m.form
      className={styles.panel}
      onSubmit={submit}
      noValidate
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.35 }}
      style={{ overflow: "hidden" }}
      aria-labelledby="cf-title"
    >
      <h2 id="cf-title" className="t-h3">
        {initial.id ? `Edit “${initial.label}”` : "New category"}
      </h2>
      <div className={styles.formRow}>
        <div className={styles.field}>
          <label htmlFor="cf-label">Name</label>
          <input
            id="cf-label"
            value={c.label}
            onChange={(e) => {
              setC({ ...c, label: e.target.value })
              setError(null)
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "cf-err" : undefined}
            autoFocus
          />
          {error && (
            <p id="cf-err" className={styles.fieldError}>
              {error}
            </p>
          )}
        </div>
        <div className={styles.field}>
          <label htmlFor="cf-art">Illustration</label>
          <select id="cf-art" value={c.art} onChange={(e) => setC({ ...c, art: e.target.value as Category["art"] })}>
            {artKinds.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={styles.formRow}>
        <div className={styles.field}>
          <label htmlFor="cf-h1">Hero headline — line 1</label>
          <input id="cf-h1" value={c.headline[0]} onChange={(e) => setC({ ...c, headline: [e.target.value, c.headline[1]] })} />
        </div>
        <div className={styles.field}>
          <label htmlFor="cf-h2">Hero headline — line 2</label>
          <input id="cf-h2" value={c.headline[1]} onChange={(e) => setC({ ...c, headline: [c.headline[0], e.target.value] })} />
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor="cf-pitch">Hero description</label>
        <textarea id="cf-pitch" rows={2} value={c.pitch} onChange={(e) => setC({ ...c, pitch: e.target.value })} />
      </div>
      <div className={styles.field}>
        <label htmlFor="cf-spec">Technical tag (shown on the blueprint)</label>
        <input id="cf-spec" placeholder="e.g. 750 ML · 18/8 STEEL" value={c.spec} onChange={(e) => setC({ ...c, spec: e.target.value })} />
      </div>
      <div className={styles.inlineActions}>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {initial.id ? "Save category" : "Create category"}
        </button>
      </div>
    </m.form>
  )
}
