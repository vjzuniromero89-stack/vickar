import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useMemo, useState, type FormEvent } from "react"
import { Icon } from "../../components/ui/Icon"
import { spring, transition } from "../../motion/tokens"
import { useRouter } from "../../state/RouterContext"
import adminStyles from "../admin.module.css"
import { useToast } from "../ui"
import { accountingApi, today, typeLabels, type AccountType, type JournalEntry } from "./api"
import { useAccounting } from "./AccountingApp"
import { cents, formatMoney, parseAmount } from "./format"
import styles from "./accounting.module.css"

type Row = { key: number; account_id: string; description: string; debit: string; credit: string }

let nextKey = 1
const blankRow = (): Row => ({ key: nextKey++, account_id: "", description: "", debit: "", credit: "" })

/**
 * Manual journal entry (new, or editing a draft).
 * Live totals show whether the entry balances; Post is only enabled when it does.
 * The database re-validates everything on save — the UI is a guide, not the guard.
 */
export function EntryForm({ draft }: { draft?: JournalEntry }) {
  const { accounts, can } = useAccounting()
  const { go } = useRouter()
  const toast = useToast()
  const reduced = useReducedMotion()
  const [date, setDate] = useState(draft?.entry_date ?? today())
  const [description, setDescription] = useState(draft?.description ?? "")
  const [memo, setMemo] = useState(draft?.memo ?? "")
  const [rows, setRows] = useState<Row[]>(() =>
    draft?.lines?.length
      ? draft.lines.map((l) => ({
          key: nextKey++,
          account_id: l.account_id,
          description: l.description ?? "",
          debit: l.debit ? String(l.debit) : "",
          credit: l.credit ? String(l.credit) : "",
        }))
      : [blankRow(), blankRow()],
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<"draft" | "post" | null>(null)

  const grouped = useMemo(() => {
    const active = accounts.filter((a) => a.is_active)
    return (Object.keys(typeLabels) as AccountType[]).map((t) => ({ type: t, items: active.filter((a) => a.type === t) }))
  }, [accounts])

  const parsed = rows.map((r) => ({ ...r, d: parseAmount(r.debit), c: parseAmount(r.credit) }))
  const invalidAmount = parsed.some((r) => Number.isNaN(r.d) || Number.isNaN(r.c))
  const totalDebit = cents(parsed.reduce((s, r) => s + (Number.isNaN(r.d) ? 0 : r.d), 0))
  const totalCredit = cents(parsed.reduce((s, r) => s + (Number.isNaN(r.c) ? 0 : r.c), 0))
  const difference = cents(totalDebit - totalCredit)
  const filled = parsed.filter((r) => r.account_id && (r.d > 0 || r.c > 0))
  const balanced = !invalidAmount && difference === 0 && totalDebit > 0
  const canPost = balanced && filled.length >= 2 && description.trim() !== "" && can("journal.post")

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r
        const next = { ...r, ...patch }
        // One side per line: typing a debit clears the credit and vice versa
        if (patch.debit !== undefined && patch.debit !== "") next.credit = ""
        if (patch.credit !== undefined && patch.credit !== "") next.debit = ""
        return next
      }),
    )

  const validate = () => {
    if (!description.trim()) return "Add a description so this entry is understandable later."
    if (!date) return "Choose the entry date."
    if (invalidAmount) return "Amounts must be numbers with up to 2 decimals."
    if (parsed.some((r) => (r.d > 0 || r.c > 0) && !r.account_id)) return "Every line with an amount needs an account."
    if (filled.length < 2) return "An entry needs at least two lines with amounts."
    return null
  }

  const submit = async (post: boolean) => {
    const problem = validate()
    if (problem) return setError(problem)
    if (post && !balanced) return setError(`The entry is out of balance by ${formatMoney(Math.abs(difference))}.`)
    setError(null)
    setBusy(post ? "post" : "draft")
    const header = { entry_date: date, description: description.trim(), memo: memo.trim() || undefined }
    const lines = filled.map((r) => ({
      account_id: r.account_id,
      debit: r.d,
      credit: r.c,
      description: r.description.trim() || undefined,
    }))
    try {
      let id = draft?.id
      if (draft) {
        await accountingApi.updateDraft(draft.id, header, lines)
        if (post) await accountingApi.post(draft.id)
      } else {
        id = await accountingApi.createEntry(header, lines, post)
      }
      toast(post ? "Entry posted" : "Draft saved")
      go(`#/admin/accounting/journal/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the entry.")
    } finally {
      setBusy(null)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void submit(true)
  }

  return (
    <form className={styles.section} onSubmit={onSubmit} noValidate aria-labelledby="entry-form-title">
      <div className={styles.sectionHead}>
        <div>
          <a href="#/admin/accounting/journal" className={adminStyles.textButton}>
            ← Journal
          </a>
          <h2 id="entry-form-title" className="t-h3">
            {draft ? "Edit draft entry" : "New journal entry"}
          </h2>
        </div>
      </div>

      <div className={adminStyles.panel}>
        <div className={styles.headerFields}>
          <div className={adminStyles.field}>
            <label htmlFor="je-date">Date</label>
            <input id="je-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className={adminStyles.field}>
            <label htmlFor="je-desc">Description</label>
            <input
              id="je-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Owner's initial capital"
              required
            />
          </div>
        </div>
        <div className={adminStyles.field}>
          <label htmlFor="je-memo">Memo (optional)</label>
          <input id="je-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Supporting detail, document number…" />
        </div>
      </div>

      <div className={adminStyles.panel}>
        <div className={styles.linesHead} aria-hidden="true">
          <span>Account</span>
          <span>Line description</span>
          <span className={styles.num}>Debit</span>
          <span className={styles.num}>Credit</span>
          <span />
        </div>
        <ul className={styles.lines}>
          <AnimatePresence initial={false}>
            {rows.map((r, i) => (
              <m.li
                key={r.key}
                className={styles.lineRow}
                layout={!reduced}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: transition.exit }}
                transition={spring.layout}
              >
                <select
                  aria-label={`Line ${i + 1} account`}
                  value={r.account_id}
                  onChange={(e) => update(r.key, { account_id: e.target.value })}
                >
                  <option value="">Choose account…</option>
                  {grouped.map((g) => (
                    <optgroup key={g.type} label={typeLabels[g.type]}>
                      {g.items.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  aria-label={`Line ${i + 1} description`}
                  value={r.description}
                  onChange={(e) => update(r.key, { description: e.target.value })}
                  placeholder="Optional"
                />
                <input
                  aria-label={`Line ${i + 1} debit`}
                  inputMode="decimal"
                  className={styles.amountInput}
                  value={r.debit}
                  onChange={(e) => update(r.key, { debit: e.target.value })}
                  placeholder="0.00"
                  aria-invalid={Number.isNaN(parseAmount(r.debit)) || undefined}
                />
                <input
                  aria-label={`Line ${i + 1} credit`}
                  inputMode="decimal"
                  className={styles.amountInput}
                  value={r.credit}
                  onChange={(e) => update(r.key, { credit: e.target.value })}
                  placeholder="0.00"
                  aria-invalid={Number.isNaN(parseAmount(r.credit)) || undefined}
                />
                <button
                  type="button"
                  className={adminStyles.iconButton}
                  aria-label={`Remove line ${i + 1}`}
                  disabled={rows.length <= 2}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Icon name="trash" size={18} />
                </button>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
        <button type="button" className="btn btn--ghost" onClick={() => setRows((rs) => [...rs, blankRow()])}>
          <Icon name="plus" size={16} /> Add line
        </button>

        <div className={styles.totals}>
          <span className="t-label t-soft">Totals</span>
          <span className={styles.num}>{formatMoney(totalDebit)}</span>
          <span className={styles.num}>{formatMoney(totalCredit)}</span>
        </div>
        <m.p
          className={styles.balance}
          data-balanced={balanced}
          role="status"
          aria-live="polite"
          initial={false}
          animate={{ opacity: 1 }}
        >
          {balanced ? (
            <>✓ Balanced — debits equal credits</>
          ) : totalDebit === 0 && totalCredit === 0 ? (
            <>Enter amounts: total debits must equal total credits</>
          ) : (
            <>Out of balance by {formatMoney(Math.abs(difference))} ({difference > 0 ? "more debits" : "more credits"})</>
          )}
        </m.p>
      </div>

      <AnimatePresence>
        {error && (
          <m.p className={adminStyles.errorBanner} role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {error}
          </m.p>
        )}
      </AnimatePresence>

      <div className={styles.formActions}>
        <a className="btn btn--ghost" href={draft ? `#/admin/accounting/journal/${draft.id}` : "#/admin/accounting/journal"}>
          Cancel
        </a>
        <button type="button" className="btn btn--ghost" disabled={busy !== null} onClick={() => submit(false)}>
          {busy === "draft" ? "Saving…" : "Save draft"}
        </button>
        {can("journal.post") && (
          <button type="submit" className="btn btn--primary" disabled={!canPost || busy !== null} aria-disabled={!canPost}>
            {busy === "post" ? "Posting…" : "Post entry"}
          </button>
        )}
      </div>
      {!can("journal.post") && <p className={adminStyles.hint}>You can save drafts; someone with posting rights will review and post them.</p>}
    </form>
  )
}
