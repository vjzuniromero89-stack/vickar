import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react"
import { ProductCard } from "../components/product/ProductCard"
import { Icon } from "../components/ui/Icon"
import { artKinds, badges, formatMoney, type Product } from "../data/catalog"
import { spring, transition } from "../motion/tokens"
import { makeId, useCatalog } from "../state/CatalogContext"
import { useRouter } from "../state/RouterContext"
import { Switch, useConfirm, useToast } from "./ui"
import styles from "./admin.module.css"

type Errors = Partial<Record<"name" | "category" | "price" | "compareAt" | "swatches" | "weightKg", string>>

const blank = (category: string): Product => ({
  id: "",
  name: "",
  category,
  price: 0,
  rating: 0,
  reviews: 0,
  blurb: "",
  specs: [],
  swatches: [{ name: "Default", hex: "#3b4047" }],
  art: "box",
  published: false,
  stock: null,
  sku: "",
  unitCost: 0,
  lowStockAlert: 2,
  weightKg: 0.5,
  lengthCm: 10,
  widthCm: 10,
  heightCm: 10,
})

function validate(p: Product): Errors {
  const e: Errors = {}
  if (!p.name.trim()) e.name = "Give the product a name."
  if (!p.category) e.category = "Choose a category (create one in Categories first)."
  if (!(p.price >= 0) || Number.isNaN(p.price)) e.price = "Enter a price of 0 or more."
  if (p.compareAt != null && !(p.compareAt > p.price)) e.compareAt = "The “compare at” price must be higher than the price."
  if (p.swatches.length === 0 || p.swatches.some((s) => !s.name.trim())) e.swatches = "Every colour needs a name."
  if (!(Number(p.weightKg) > 0)) e.weightKg = "Weight must be more than 0 (needed for shipping rates)."
  return e
}

export function ProductEditor({ id }: { id: string }) {
  const { products, categories, saveProduct, deleteProduct, uploadImage, status } = useCatalog()
  const { go } = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const reduced = useReducedMotion()
  const isNew = id === "new"
  const existing = products.find((p) => p.id === id)

  const [draft, setDraft] = useState<Product>(() => existing ?? blank(categories[0]?.id ?? ""))
  const [saved, setSaved] = useState<Product>(draft)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // The catalogue loads asynchronously (Supabase): adopt the product once it arrives
  useEffect(() => {
    if (existing && !draft.id) {
      setDraft(existing)
      setSaved(existing)
    }
  }, [existing, draft.id])

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved])

  // Warn before leaving the tab with unsaved edits
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  if (!isNew && !existing) {
    return (
      <div className={styles.page}>
        <p className="t-soft">{status === "loading" ? "Loading…" : "This product doesn't exist anymore."}</p>
        <a href="#/admin/products" className={styles.textButton}>
          ← Back to products
        </a>
      </div>
    )
  }

  const set = <K extends keyof Product>(key: K, value: Product[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    if (key in errors) setErrors((x) => ({ ...x, [key]: undefined }))
  }
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v))

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file (JPG, PNG, WebP…)", "error")
      return
    }
    setUploading(true)
    try {
      const url = await uploadImage(file, draft.id || makeId(draft.name || "product", []))
      set("image", url)
      if (!draft.imageAlt) set("imageAlt", draft.name)
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error")
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    void onFile(e.dataTransfer.files[0])
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const found = validate(draft)
    setErrors(found)
    if (Object.keys(found).length) {
      document.getElementById(`pe-${Object.keys(found)[0]}`)?.focus()
      toast("Please fix the highlighted fields", "error")
      return
    }
    const product: Product = {
      ...draft,
      name: draft.name.trim(),
      id: draft.id || makeId(draft.name, products.map((p) => p.id)),
      specs: draft.specs.map((s) => s.trim()).filter(Boolean),
      swatches: draft.swatches.map((s) => ({ ...s, name: s.name.trim() })),
    }
    setSaving(true)
    try {
      await saveProduct(product)
      setDraft(product)
      setSaved(product)
      toast(`${product.name} saved`)
      if (isNew) go(`#/admin/products/${product.id}`)
    } catch {
      toast("Couldn't save. Check your connection and try again.", "error")
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete ${draft.name}?`,
      body: "This removes it from the store permanently.",
      action: "Delete product",
      danger: true,
    })
    if (!ok) return
    await deleteProduct(draft.id)
    toast(`${draft.name} deleted`)
    go("#/admin/products")
  }

  const err = (k: keyof Errors) =>
    errors[k] ? (
      <p id={`pe-${k}-err`} className={styles.fieldError}>
        {errors[k]}
      </p>
    ) : null
  const aria = (k: keyof Errors) => (errors[k] ? { "aria-invalid": true, "aria-describedby": `pe-${k}-err` } : {})

  const preview: Product = { ...draft, id: draft.id || "preview", name: draft.name || "Product name" }

  return (
    <form className={styles.page} onSubmit={onSubmit} noValidate>
      <header className={styles.pageHead}>
        <div>
          <a href="#/admin/products" className={styles.textButton}>
            ← Products
          </a>
          <h1 className="t-h1">{isNew ? "New product" : draft.name || "Untitled"}</h1>
        </div>
        {!isNew && (
          <a className="btn btn--ghost" href={`#/p/${draft.id}`} target="_blank" rel="noreferrer">
            View in store <Icon name="external" size={16} />
          </a>
        )}
      </header>

      <div className={styles.editor}>
        <div className={styles.editorMain}>
          {/* Basics */}
          <section className={styles.panel} aria-labelledby="pe-basics">
            <h2 id="pe-basics" className="t-h3">
              Basics
            </h2>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label htmlFor="pe-name">Name</label>
                <input id="pe-name" value={draft.name} onChange={(e) => set("name", e.target.value)} {...aria("name")} />
                {err("name")}
              </div>
              <div className={styles.field}>
                <label htmlFor="pe-sku">SKU</label>
                <input
                  id="pe-sku"
                  value={draft.sku ?? ""}
                  onChange={(e) => set("sku", e.target.value.toUpperCase())}
                  placeholder="e.g. ARC-750-GRA"
                  autoCapitalize="characters"
                />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label htmlFor="pe-category">Category</label>
                <select id="pe-category" value={draft.category} onChange={(e) => set("category", e.target.value)} {...aria("category")}>
                  {categories.length === 0 && <option value="">No categories yet</option>}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {err("category")}
              </div>
              <div className={styles.field}>
                <label htmlFor="pe-badge">Badge</label>
                <select
                  id="pe-badge"
                  value={draft.badge ?? ""}
                  onChange={(e) => set("badge", (e.target.value || undefined) as Product["badge"])}
                >
                  <option value="">None</option>
                  {badges.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="pe-blurb">Description</label>
              <textarea id="pe-blurb" rows={4} value={draft.blurb} onChange={(e) => set("blurb", e.target.value)} />
            </div>
          </section>

          {/* Pricing */}
          <section className={styles.panel} aria-labelledby="pe-pricing">
            <h2 id="pe-pricing" className="t-h3">
              Pricing
            </h2>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label htmlFor="pe-price">Price (USD)</label>
                <input
                  id="pe-price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={Number.isNaN(draft.price) ? "" : draft.price}
                  onChange={(e) => set("price", Number(e.target.value))}
                  {...aria("price")}
                />
                {err("price")}
              </div>
              <div className={styles.field}>
                <label htmlFor="pe-compareAt">Compare-at price (optional)</label>
                <input
                  id="pe-compareAt"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={draft.compareAt ?? ""}
                  onChange={(e) => set("compareAt", num(e.target.value))}
                  {...aria("compareAt")}
                />
                {err("compareAt") ?? <p className={styles.hint}>Shown crossed out, for sales.</p>}
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label htmlFor="pe-unitCost">Unit cost (USD)</label>
                <input
                  id="pe-unitCost"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={draft.unitCost ?? ""}
                  onChange={(e) => set("unitCost", num(e.target.value))}
                />
                <p className={styles.hint}>What one unit costs you (product + freight + duties). Past sales keep the cost they had.</p>
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Margin per unit</span>
                <p className={styles.marginValue} data-negative={draft.price - (draft.unitCost ?? 0) < 0}>
                  {draft.unitCost
                    ? `${formatMoney(draft.price - draft.unitCost)} · ${draft.price > 0 ? Math.round(((draft.price - draft.unitCost) / draft.price) * 100) : 0}%`
                    : "Add a unit cost to see it"}
                </p>
                <p className={styles.hint}>Before Stripe fees and shipping.</p>
              </div>
            </div>
          </section>

          {/* Media */}
          <section className={styles.panel} aria-labelledby="pe-media">
            <h2 id="pe-media" className="t-h3">
              Photo
            </h2>
            <div
              className={styles.dropzone}
              data-over={dragOver}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              {draft.image ? (
                <img src={draft.image} alt="" className={styles.dropPreview} />
              ) : (
                <Icon name="upload" size={28} />
              )}
              <div className={styles.dropText}>
                <p>{uploading ? "Uploading…" : draft.image ? "Replace the photo" : "Drop a photo here"}</p>
                <p className={styles.hint}>JPG, PNG or WebP. It's resized and compressed automatically.</p>
                <div className={styles.inlineActions}>
                  <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    Choose file
                  </button>
                  {draft.image && (
                    <button type="button" className={styles.textButton} onClick={() => set("image", undefined)}>
                      Remove photo
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    void onFile(e.target.files?.[0])
                    e.target.value = ""
                  }}
                />
              </div>
            </div>
            {draft.image ? (
              <div className={styles.field}>
                <label htmlFor="pe-alt">Photo description (for screen readers & SEO)</label>
                <input id="pe-alt" value={draft.imageAlt ?? ""} onChange={(e) => set("imageAlt", e.target.value)} />
              </div>
            ) : (
              <div className={styles.field}>
                <label htmlFor="pe-art">Illustration while there's no photo</label>
                <select id="pe-art" value={draft.art} onChange={(e) => set("art", e.target.value as Product["art"])}>
                  {artKinds.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>

          {/* Colours */}
          <section className={styles.panel} aria-labelledby="pe-colours">
            <div className={styles.panelHead}>
              <h2 id="pe-colours" className="t-h3">
                Colours
              </h2>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => set("swatches", [...draft.swatches, { name: "", hex: "#888888" }])}
              >
                <Icon name="plus" size={16} /> Add colour
              </button>
            </div>
            <ul className={styles.repeat} id="pe-swatches" tabIndex={-1}>
              <AnimatePresence initial={false}>
                {draft.swatches.map((s, i) => (
                  <m.li
                    key={i}
                    layout={!reduced}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: transition.exit }}
                    transition={spring.layout}
                  >
                    <input
                      type="color"
                      value={s.hex}
                      aria-label={`Colour ${i + 1} value`}
                      onChange={(e) => set("swatches", draft.swatches.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))}
                    />
                    <input
                      placeholder="Colour name, e.g. Graphite"
                      value={s.name}
                      aria-label={`Colour ${i + 1} name`}
                      onChange={(e) => set("swatches", draft.swatches.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    />
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Remove colour ${s.name || i + 1}`}
                      disabled={draft.swatches.length === 1}
                      onClick={() => set("swatches", draft.swatches.filter((_, j) => j !== i))}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
            {err("swatches")}
          </section>

          {/* Specs */}
          <section className={styles.panel} aria-labelledby="pe-specs">
            <div className={styles.panelHead}>
              <h2 id="pe-specs" className="t-h3">
                Specifications
              </h2>
              <button type="button" className="btn btn--ghost" onClick={() => set("specs", [...draft.specs, ""])}>
                <Icon name="plus" size={16} /> Add line
              </button>
            </div>
            {draft.specs.length === 0 && <p className={styles.hint}>e.g. “750 ml”, “18/8 stainless steel”.</p>}
            <ul className={styles.repeat}>
              {draft.specs.map((s, i) => (
                <li key={i}>
                  <input
                    value={s}
                    aria-label={`Specification ${i + 1}`}
                    onChange={(e) => set("specs", draft.specs.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Remove specification ${i + 1}`}
                    onClick={() => set("specs", draft.specs.filter((_, j) => j !== i))}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Inventory & shipping */}
          <section className={styles.panel} aria-labelledby="pe-ship">
            <h2 id="pe-ship" className="t-h3">
              Inventory & shipping
            </h2>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Current stock</span>
                <p className={styles.stockValue}>
                  {draft.stock == null ? "Not tracked yet" : `${draft.stock} unit${draft.stock === 1 ? "" : "s"}`}
                </p>
                <p className={styles.hint}>
                  Stock changes only through <a href="#/admin/inventory">Inventory</a> movements, so every unit has a history. Sales deduct it
                  automatically.
                </p>
              </div>
              <div className={styles.field}>
                <label htmlFor="pe-lowStock">Low stock alert</label>
                <input
                  id="pe-lowStock"
                  type="number"
                  min="0"
                  step="1"
                  value={draft.lowStockAlert ?? 2}
                  onChange={(e) => set("lowStockAlert", Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                />
                <p className={styles.hint}>Warn on the dashboard at this many units or fewer.</p>
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label htmlFor="pe-weightKg">Packed weight (kg)</label>
                <input
                  id="pe-weightKg"
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.weightKg ?? ""}
                  onChange={(e) => set("weightKg", num(e.target.value))}
                  {...aria("weightKg")}
                />
                {err("weightKg")}
              </div>
            </div>
            <div className={styles.formRow3}>
              {(["lengthCm", "widthCm", "heightCm"] as const).map((k) => (
                <div key={k} className={styles.field}>
                  <label htmlFor={`pe-${k}`}>{k === "lengthCm" ? "Length" : k === "widthCm" ? "Width" : "Height"} (cm)</label>
                  <input id={`pe-${k}`} type="number" min="0" step="0.5" value={draft[k] ?? ""} onChange={(e) => set(k, num(e.target.value))} />
                </div>
              ))}
            </div>
            <div className={styles.field}>
              <label htmlFor="pe-hs">HS customs code (for international shipping)</label>
              <input id="pe-hs" inputMode="numeric" placeholder="e.g. 732393" value={draft.hsCode ?? ""} onChange={(e) => set("hsCode", e.target.value || undefined)} />
            </div>
          </section>

          {/* Social proof */}
          <section className={styles.panel} aria-labelledby="pe-reviews">
            <h2 id="pe-reviews" className="t-h3">
              Rating
            </h2>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label htmlFor="pe-rating">Average rating (0–5)</label>
                <input
                  id="pe-rating"
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={draft.rating}
                  onChange={(e) => set("rating", Math.min(5, Math.max(0, Number(e.target.value))))}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="pe-reviews-n">Number of reviews</label>
                <input
                  id="pe-reviews-n"
                  type="number"
                  min="0"
                  step="1"
                  value={draft.reviews}
                  onChange={(e) => set("reviews", Math.max(0, Math.floor(Number(e.target.value))))}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar: visibility + live preview */}
        <aside className={styles.editorSide}>
          <section className={styles.panel} aria-labelledby="pe-vis">
            <div className={styles.panelHead}>
              <h2 id="pe-vis" className="t-h3">
                Visible in store
              </h2>
              <Switch checked={draft.published} onChange={(v) => set("published", v)} label="Visible in store" />
            </div>
            <p className={styles.hint}>{draft.published ? "Customers can see and buy it." : "Draft — only admins can see it."}</p>
          </section>
          <section className={styles.panel} aria-labelledby="pe-preview">
            <h2 id="pe-preview" className="t-label t-soft">
              Live preview
            </h2>
            <div className={styles.previewCard} inert>
              <ProductCard product={preview} onQuickView={() => {}} />
            </div>
          </section>
          {!isNew && (
            <button type="button" className={`btn ${styles.danger}`} onClick={onDelete}>
              <Icon name="trash" size={16} /> Delete product
            </button>
          )}
        </aside>
      </div>

      {/* Save bar */}
      <div className={styles.saveBar} data-dirty={dirty || isNew}>
        <span className="t-small t-soft" role="status">
          {saving ? "Saving…" : dirty ? "Unsaved changes" : isNew ? "New product" : "All changes saved"}
        </span>
        <div className={styles.inlineActions}>
          {dirty && !isNew && (
            <button type="button" className="btn btn--ghost" onClick={() => setDraft(saved)}>
              Discard
            </button>
          )}
          <button type="submit" className="btn btn--primary" disabled={saving || uploading || (!dirty && !isNew)}>
            {isNew ? "Create product" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  )
}
