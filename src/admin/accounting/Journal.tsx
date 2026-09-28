import { useEffect, useState } from "react"
import { Icon } from "../../components/ui/Icon"
import adminStyles from "../admin.module.css"
import { accountingApi, sourceLabels, type EntryStatus, type JournalEntry } from "./api"
import { useAccounting } from "./AccountingApp"
import { formatDate, Money } from "./format"
import styles from "./accounting.module.css"

export const statusTone: Record<EntryStatus, string> = { draft: "warn", posted: "ok", void: "muted" }

/** Journal: every entry, newest first. Click through to the full entry with its lines. */
export function Journal() {
  const { can } = useAccounting()
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<EntryStatus | "all">("all")
  const [source, setSource] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [q, setQ] = useState("")

  useEffect(() => {
    let cancelled = false
    const t = window.setTimeout(() => {
      accountingApi
        .entries({ status, source: source || undefined, from: from || undefined, to: to || undefined, q })
        .then((r) => !cancelled && setEntries(r))
        .catch((e: Error) => !cancelled && setError(e.message))
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [status, source, from, to, q])

  return (
    <section className={styles.section} aria-labelledby="journal-title">
      <div className={styles.sectionHead}>
        <h2 id="journal-title" className="t-h3">
          Journal entries
        </h2>
        {can("journal.create") && (
          <a className="btn btn--primary" href="#/admin/accounting/journal/new">
            <Icon name="plus" size={18} /> New entry
          </a>
        )}
      </div>

      <div className={styles.filters}>
        <label className={adminStyles.search}>
          <Icon name="search" size={18} />
          <span className="sr-only">Search entries</span>
          <input type="search" placeholder="Entry #, description or reference…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className={styles.filterField}>
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as EntryStatus | "all")}>
            <option value="all">All</option>
            <option value="posted">Posted</option>
            <option value="draft">Draft</option>
            <option value="void">Void</option>
          </select>
        </label>
        <label className={styles.filterField}>
          <span>Source</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            {Object.entries(sourceLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          <span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className={styles.filterField}>
          <span>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {error && (
        <p className={adminStyles.errorBanner} role="alert">
          {error}
        </p>
      )}

      {entries === null ? (
        <p className="t-soft">Loading…</p>
      ) : entries.length === 0 ? (
        <div className={adminStyles.emptyState}>
          <p className="t-h3">No entries yet.</p>
          <p className="t-soft">
            Sales, fees and refunds will post here automatically in the next phases. You can record manual entries now (e.g. the owner's
            opening capital).
          </p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Date</th>
                <th scope="col">Description</th>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
                <th scope="col" className={styles.num}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={styles.clickRow}>
                  <td className={styles.mono}>{e.entry_number ?? "—"}</td>
                  <td className={styles.nowrap}>{formatDate(e.entry_date)}</td>
                  <td>
                    <a href={`#/admin/accounting/journal/${e.id}`} className={styles.rowLink}>
                      {e.description}
                    </a>
                    {(e.reversal_of || e.reversed_by) && (
                      <span className={styles.tag}>{e.reversal_of ? "Reversal" : "Reversed"}</span>
                    )}
                  </td>
                  <td className="t-small t-soft">{sourceLabels[e.source] ?? e.source}</td>
                  <td>
                    <span className={styles.status} data-tone={statusTone[e.status]}>
                      {e.status}
                    </span>
                  </td>
                  <td className={styles.num}>
                    <Money value={e.total} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
