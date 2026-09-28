import { useEffect, useState } from "react"
import adminStyles from "../admin.module.css"
import { accountingApi, type AuditRow } from "./api"
import { formatDateTime } from "./format"
import styles from "./accounting.module.css"

const tables = [
  { id: "", label: "Everything" },
  { id: "journal_entries", label: "Journal entries" },
  { id: "accounts", label: "Chart of accounts" },
  { id: "accounting_periods", label: "Periods" },
  { id: "accounting_settings", label: "Settings" },
  { id: "admin_roles", label: "Admin roles" },
]

/** Append-only audit trail: who did what, when, why — with before/after values. */
export function AuditLog() {
  const [table, setTable] = useState("")
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    accountingApi
      .audit({ table: table || undefined, limit: 300 })
      .then((r) => !cancelled && setRows(r))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [table])

  return (
    <section className={styles.section} aria-labelledby="audit-title">
      <div className={styles.sectionHead}>
        <h2 id="audit-title" className="t-h3">
          Audit log
        </h2>
        <label className={styles.filterField}>
          <span>Show</span>
          <select value={table} onChange={(e) => setTable(e.target.value)}>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={adminStyles.hint}>The log can't be edited or deleted by anyone, including owners.</p>

      {error && (
        <p className={adminStyles.errorBanner} role="alert">
          {error}
        </p>
      )}
      {!rows ? (
        <p className="t-soft">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="t-soft">Nothing recorded yet.</p>
      ) : (
        <ul className={styles.auditList}>
          {rows.map((r) => (
            <li key={r.id}>
              <details>
                <summary>
                  <span className={styles.mono}>{r.action}</span>
                  <span>{tables.find((t) => t.id === r.table_name)?.label ?? r.table_name}</span>
                  <span className="t-small t-soft">
                    {formatDateTime(r.occurred_at)} · {r.source === "system" ? "system" : `user ${r.actor_id?.slice(0, 8) ?? ""}`}
                  </span>
                  {r.reason && <span className="t-small">“{r.reason}”</span>}
                </summary>
                <div className={styles.diff}>
                  {r.old_data && (
                    <div>
                      <p className="t-label t-soft">Before</p>
                      <pre>{JSON.stringify(r.old_data, null, 2)}</pre>
                    </div>
                  )}
                  {r.new_data && (
                    <div>
                      <p className="t-label t-soft">After</p>
                      <pre>{JSON.stringify(r.new_data, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
