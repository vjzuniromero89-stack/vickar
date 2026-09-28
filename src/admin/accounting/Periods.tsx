import { AnimatePresence } from "motion/react"
import { useCallback, useEffect, useState } from "react"
import adminStyles from "../admin.module.css"
import { useToast } from "../ui"
import { accountingApi, type Period } from "./api"
import { useAccounting } from "./AccountingApp"
import { ReasonDialog } from "./EntryDetail"
import { formatDateTime, monthLabel } from "./format"
import styles from "./accounting.module.css"

/** Monthly periods. Closing locks a month; reopening needs a reason and is audited. */
export function Periods() {
  const { can } = useAccounting()
  const toast = useToast()
  const [periods, setPeriods] = useState<Period[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, number>>({})
  const [dialog, setDialog] = useState<{ kind: "close" | "reopen"; period: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([accountingApi.periods(), accountingApi.draftCounts()])
      // Always show the current and previous month, even before anything was posted
      const now = new Date()
      const months = [0, 1].map((i) => new Date(now.getFullYear(), now.getMonth() - i, 1).toLocaleDateString("en-CA"))
      const merged = [...p]
      for (const mth of months) {
        if (!merged.some((x) => x.period_start === mth)) {
          merged.push({ id: mth, period_start: mth, period_end: "", status: "open", closed_at: null, reopened_at: null, notes: null })
        }
      }
      setPeriods(merged.sort((a, b) => b.period_start.localeCompare(a.period_start)))
      setDrafts(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load periods.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className={styles.section} aria-labelledby="periods-title">
      <div className={styles.sectionHead}>
        <h2 id="periods-title" className="t-h3">
          Accounting periods
        </h2>
      </div>
      <p className={adminStyles.hint}>
        Close a month once its books are final: nothing can be posted into a closed month. Reopening requires a reason and is recorded in the audit log.
      </p>

      {error && (
        <p className={adminStyles.errorBanner} role="alert">
          {error}
        </p>
      )}

      {!periods ? (
        <p className="t-soft">Loading…</p>
      ) : (
        <ul className={adminStyles.list}>
          {periods.map((p) => {
            const month = p.period_start.slice(0, 7)
            const pending = drafts[month] ?? 0
            return (
              <li key={p.period_start} className={`${adminStyles.listRow} ${styles.periodRow}`}>
                <span>
                  <strong>{monthLabel(p.period_start)}</strong>
                  <span className="t-small t-soft">
                    {p.status === "closed" && p.closed_at ? ` · closed ${formatDateTime(p.closed_at)}` : ""}
                    {p.status === "open" && p.reopened_at ? ` · reopened ${formatDateTime(p.reopened_at)}` : ""}
                    {pending > 0 ? ` · ${pending} draft${pending === 1 ? "" : "s"} pending` : ""}
                  </span>
                </span>
                <span className={styles.status} data-tone={p.status === "closed" ? "muted" : "ok"}>
                  {p.status}
                </span>
                <span>
                  {p.status === "open" && can("periods.close") && (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={pending > 0}
                      title={pending > 0 ? "Post or void the drafts in this month first" : undefined}
                      onClick={() => setDialog({ kind: "close", period: p.period_start })}
                    >
                      Close month
                    </button>
                  )}
                  {p.status === "closed" && can("periods.reopen") && (
                    <button type="button" className="btn btn--ghost" onClick={() => setDialog({ kind: "reopen", period: p.period_start })}>
                      Reopen
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <AnimatePresence>
        {dialog && (
          <ReasonDialog
            key={dialog.kind + dialog.period}
            title={`${dialog.kind === "close" ? "Close" : "Reopen"} ${monthLabel(dialog.period)}`}
            body={
              dialog.kind === "close"
                ? "After closing, no entries can be posted with a date in this month. Add a note for the record (e.g. “Reconciled with bank statement”)."
                : "Reopening allows new postings in this month. Explain why — this is kept in the audit log."
            }
            action={dialog.kind === "close" ? "Close month" : "Reopen month"}
            danger={dialog.kind === "reopen"}
            onCancel={() => setDialog(null)}
            onConfirm={async (reason) => {
              if (dialog.kind === "close") await accountingApi.closePeriod(dialog.period, reason)
              else await accountingApi.reopenPeriod(dialog.period, reason)
              toast(`${monthLabel(dialog.period)} ${dialog.kind === "close" ? "closed" : "reopened"}`)
              setDialog(null)
              await load()
            }}
          />
        )}
      </AnimatePresence>
    </section>
  )
}
