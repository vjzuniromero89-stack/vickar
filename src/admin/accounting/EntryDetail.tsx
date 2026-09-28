import { AnimatePresence, m } from "motion/react"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { useFocusTrap } from "../../hooks/useFocusTrap"
import { spring, transition } from "../../motion/tokens"
import adminStyles from "../admin.module.css"
import { useToast } from "../ui"
import { accountingApi, sourceLabels, today, type AuditRow, type JournalEntry } from "./api"
import { useAccounting } from "./AccountingApp"
import { EntryForm } from "./EntryForm"
import { formatDate, formatDateTime, Money } from "./format"
import { statusTone } from "./Journal"
import styles from "./accounting.module.css"

/** One journal entry: header, lines, links to its reversal, actions, and its audit history. */
export function EntryDetail({ id }: { id: string }) {
  const { can } = useAccounting()
  const toast = useToast()
  const [entry, setEntry] = useState<JournalEntry | null | undefined>(undefined)
  const [history, setHistory] = useState<AuditRow[]>([])
  const [editing, setEditing] = useState(false)
  const [dialog, setDialog] = useState<"reverse" | "void" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setEntry(await accountingApi.entry(id))
      if (can("audit.view")) setHistory(await accountingApi.audit({ recordId: id, limit: 50 }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the entry.")
    }
  }, [id, can])

  useEffect(() => {
    void load()
  }, [load])

  if (entry === undefined) return <p className="t-soft">{error ?? "Loading…"}</p>
  if (entry === null) {
    return (
      <div>
        <p className="t-soft">Entry not found.</p>
        <a href="#/admin/accounting/journal" className={adminStyles.textButton}>
          ← Journal
        </a>
      </div>
    )
  }
  if (editing && entry.status === "draft") return <EntryForm draft={entry} />

  const debits = entry.lines?.reduce((s, l) => s + l.debit, 0) ?? 0
  const credits = entry.lines?.reduce((s, l) => s + l.credit, 0) ?? 0

  const post = async () => {
    try {
      await accountingApi.post(entry.id)
      toast("Entry posted")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post.")
    }
  }

  return (
    <section className={styles.section} aria-labelledby="entry-title">
      <div className={styles.sectionHead}>
        <div>
          <a href="#/admin/accounting/journal" className={adminStyles.textButton}>
            ← Journal
          </a>
          <h2 id="entry-title" className="t-h3">
            {entry.entry_number ? `Entry #${entry.entry_number}` : "Draft entry"} · {entry.description}
          </h2>
        </div>
        <span className={styles.status} data-tone={statusTone[entry.status]}>
          {entry.status}
        </span>
      </div>

      {entry.reversed_by && (
        <p className={styles.notice}>
          This entry was reversed by{" "}
          <a href={`#/admin/accounting/journal/${entry.reversed_by}`} className={styles.rowLink}>
            a reversal entry
          </a>
          . Its effect on the books is zero.
        </p>
      )}
      {entry.reversal_of && (
        <p className={styles.notice}>
          This entry reverses{" "}
          <a href={`#/admin/accounting/journal/${entry.reversal_of}`} className={styles.rowLink}>
            the original entry
          </a>
          .
        </p>
      )}

      <dl className={styles.meta}>
        <div>
          <dt>Date</dt>
          <dd>{formatDate(entry.entry_date)}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {sourceLabels[entry.source] ?? entry.source}
            {entry.source_ref ? <span className="t-soft"> · {entry.source_ref}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>
            {formatDateTime(entry.created_at)} · {entry.created_origin === "system" ? "automatic" : "manual"}
          </dd>
        </div>
        {entry.posted_at && (
          <div>
            <dt>Posted</dt>
            <dd>{formatDateTime(entry.posted_at)}</dd>
          </div>
        )}
        {entry.memo && (
          <div className={styles.metaWide}>
            <dt>Memo</dt>
            <dd>{entry.memo}</dd>
          </div>
        )}
      </dl>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Description</th>
              <th scope="col">Reference</th>
              <th scope="col" className={styles.num}>
                Debit
              </th>
              <th scope="col" className={styles.num}>
                Credit
              </th>
            </tr>
          </thead>
          <tbody>
            {entry.lines?.map((l) => (
              <tr key={l.id}>
                <td>
                  <a href={`#/admin/accounting/ledger/${l.account_id}`} className={styles.rowLink}>
                    <span className={styles.mono}>{l.account?.code}</span> {l.account?.name}
                  </a>
                </td>
                <td className="t-small">{l.description ?? ""}</td>
                <td className="t-small t-soft">
                  {[l.order_id && "Order", l.sku, l.stripe_object_id, l.reference].filter(Boolean).join(" · ")}
                </td>
                <td className={styles.num}>
                  <Money value={l.debit} blankZero />
                </td>
                <td className={styles.num}>
                  <Money value={l.credit} blankZero />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Total
              </th>
              <td className={styles.num}>
                <Money value={debits} strong />
              </td>
              <td className={styles.num}>
                <Money value={credits} strong />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {error && (
        <p className={adminStyles.errorBanner} role="alert">
          {error}
        </p>
      )}

      <div className={styles.formActions}>
        {entry.status === "draft" && can("journal.create") && (
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDialog("void")}>
              Void draft
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)}>
              Edit draft
            </button>
          </>
        )}
        {entry.status === "draft" && can("journal.post") && (
          <button type="button" className="btn btn--primary" onClick={post}>
            Post entry
          </button>
        )}
        {entry.status === "posted" && !entry.reversed_by && !entry.reversal_of && can("journal.post") && (
          <button type="button" className="btn btn--ghost" onClick={() => setDialog("reverse")}>
            Reverse entry
          </button>
        )}
      </div>
      {entry.status === "posted" && (
        <p className={adminStyles.hint}>
          Posted entries can't be edited or deleted. To correct one, reverse it and record the right entry — both stay in the books.
        </p>
      )}

      {history.length > 0 && (
        <div className={adminStyles.panel}>
          <h3 className="t-label t-soft">History</h3>
          <ul className={styles.history}>
            {history.map((h) => (
              <li key={h.id}>
                <span className={styles.mono}>{h.action}</span>
                <span className="t-small t-soft">
                  {formatDateTime(h.occurred_at)} · {h.source === "system" ? "system" : "user"}
                  {h.reason ? ` · “${h.reason}”` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AnimatePresence>
        {dialog && (
          <ReasonDialog
            key={dialog}
            title={dialog === "reverse" ? `Reverse entry #${entry.entry_number}` : "Void this draft"}
            body={
              dialog === "reverse"
                ? "A new entry with debits and credits swapped will be posted. The original stays in the books, linked to its reversal."
                : "The draft is kept for the record as void and won't affect the books."
            }
            action={dialog === "reverse" ? "Post reversal" : "Void draft"}
            withDate={dialog === "reverse"}
            onCancel={() => setDialog(null)}
            onConfirm={async (reason, date) => {
              if (dialog === "reverse") {
                await accountingApi.reverse(entry.id, date, reason)
                toast("Reversal posted")
              } else {
                await accountingApi.voidDraft(entry.id, reason)
                toast("Draft voided")
              }
              setDialog(null)
              await load()
            }}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

/** Required-reason dialog (optionally with a date) for audited actions. */
export function ReasonDialog({
  title,
  body,
  action,
  withDate,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  action: string
  withDate?: boolean
  danger?: boolean
  onCancel: () => void
  onConfirm: (reason: string, date: string) => Promise<void>
}) {
  const ref = useRef<HTMLFormElement>(null)
  const [reason, setReason] = useState("")
  const [date, setDate] = useState(today())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useFocusTrap(ref, true, onCancel)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) return setError("A reason is required — it's kept in the audit log.")
    setBusy(true)
    try {
      await onConfirm(reason.trim(), date)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
      setBusy(false)
    }
  }

  return (
    <div className={adminStyles.modalRoot}>
      <m.div className={adminStyles.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} />
      <m.form
        ref={ref}
        className={adminStyles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reason-title"
        onSubmit={submit}
        noValidate
        initial={{ opacity: 0, transform: "scale(0.96)" }}
        animate={{ opacity: 1, transform: "scale(1)" }}
        exit={{ opacity: 0, transition: transition.exit }}
        transition={spring.ui}
      >
        <h2 id="reason-title" className="t-h3">
          {title}
        </h2>
        <p className="t-soft">{body}</p>
        {withDate && (
          <div className={adminStyles.field}>
            <label htmlFor="reason-date">Date</label>
            <input id="reason-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}
        <div className={adminStyles.field}>
          <label htmlFor="reason-text">Reason</label>
          <textarea
            id="reason-text"
            rows={2}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setError(null)
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "reason-error" : undefined}
          />
          {error && (
            <p id="reason-error" className={adminStyles.fieldError}>
              {error}
            </p>
          )}
        </div>
        <div className={adminStyles.modalActions}>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={`btn ${danger ? adminStyles.danger : "btn--primary"}`} disabled={busy}>
            {busy ? "Working…" : action}
          </button>
        </div>
      </m.form>
    </div>
  )
}
