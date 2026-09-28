import { useEffect, useMemo, useState } from "react"
import adminStyles from "../admin.module.css"
import { accountingApi, today, typeLabels, yearStart, type AccountType, type TrialBalanceRow } from "./api"
import { cents, downloadCsv, formatDate, Money } from "./format"
import styles from "./accounting.module.css"

/**
 * Trial balance as of a date: each account's balance in the Debit or Credit column.
 * The two totals must match — the proof that the books balance. Optional activity columns.
 */
export function TrialBalance() {
  const [from, setFrom] = useState(yearStart())
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState<TrialBalanceRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showZero, setShowZero] = useState(false)
  const [showActivity, setShowActivity] = useState(false)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    accountingApi
      .trialBalance(from, to)
      .then((r) => !cancelled && setRows(r))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [from, to])

  // Balance column: normal-direction balance → its natural side; a negative (abnormal) balance flips side
  const withSides = useMemo(
    () =>
      (rows ?? []).map((r) => {
        const debitSide = (r.normal_balance === "debit") === r.closing >= 0
        return { ...r, dr: debitSide ? Math.abs(r.closing) : 0, cr: debitSide ? 0 : Math.abs(r.closing) }
      }),
    [rows],
  )
  const visible = withSides.filter((r) => showZero || Math.abs(r.closing) > 0.004 || r.debits > 0 || r.credits > 0)
  const totalDr = cents(withSides.reduce((s, r) => s + r.dr, 0))
  const totalCr = cents(withSides.reduce((s, r) => s + r.cr, 0))
  const balanced = totalDr === totalCr

  return (
    <section className={styles.section} aria-labelledby="tb-title">
      <div className={styles.sectionHead}>
        <h2 id="tb-title" className="t-h3">
          Trial balance · as of {formatDate(to)}
        </h2>
        {rows && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() =>
              downloadCsv(`trial-balance-${to}.csv`, [
                ["Code", "Account", "Type", "Opening", "Period debits", "Period credits", "Debit balance", "Credit balance"],
                ...withSides.map((r) => [r.code, r.name, r.type, r.opening.toFixed(2), r.debits.toFixed(2), r.credits.toFixed(2), r.dr.toFixed(2), r.cr.toFixed(2)]),
                ["", "Total", "", "", "", "", totalDr.toFixed(2), totalCr.toFixed(2)],
              ])
            }
          >
            Export CSV
          </button>
        )}
      </div>

      <div className={styles.filters}>
        <label className={styles.filterField}>
          <span>Activity from</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className={styles.filterField}>
          <span>As of</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={showActivity} onChange={(e) => setShowActivity(e.target.checked)} /> Show period activity
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} /> Show zero-balance accounts
        </label>
      </div>

      {error && (
        <p className={adminStyles.errorBanner} role="alert">
          {error}
        </p>
      )}

      {!rows ? (
        <p className="t-soft">Loading…</p>
      ) : (
        <>
          <p className={styles.balance} data-balanced={balanced} role="status">
            {balanced
              ? `✓ In balance — total debits equal total credits (${formatMoneyPlain(totalDr)})`
              : `Out of balance by ${formatMoneyPlain(Math.abs(totalDr - totalCr))} — contact support`}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  {showActivity && (
                    <>
                      <th scope="col" className={styles.num}>
                        Opening
                      </th>
                      <th scope="col" className={styles.num}>
                        Debits
                      </th>
                      <th scope="col" className={styles.num}>
                        Credits
                      </th>
                    </>
                  )}
                  <th scope="col" className={styles.num}>
                    Debit
                  </th>
                  <th scope="col" className={styles.num}>
                    Credit
                  </th>
                </tr>
              </thead>
              {(Object.keys(typeLabels) as AccountType[]).map((t) => {
                const group = visible.filter((r) => r.type === t)
                if (group.length === 0) return null
                return (
                  <tbody key={t}>
                    <tr className={styles.groupRow}>
                      <th scope="rowgroup" colSpan={showActivity ? 6 : 3}>
                        {typeLabels[t]}
                      </th>
                    </tr>
                    {group.map((r) => (
                      <tr key={r.account_id}>
                        <td>
                          <a href={`#/admin/accounting/ledger/${r.account_id}`} className={styles.rowLink}>
                            <span className={styles.mono}>{r.code}</span> {r.name}
                          </a>
                        </td>
                        {showActivity && (
                          <>
                            <td className={styles.num}>
                              <Money value={r.opening} blankZero />
                            </td>
                            <td className={styles.num}>
                              <Money value={r.debits} blankZero />
                            </td>
                            <td className={styles.num}>
                              <Money value={r.credits} blankZero />
                            </td>
                          </>
                        )}
                        <td className={styles.num}>
                          <Money value={r.dr} blankZero />
                        </td>
                        <td className={styles.num}>
                          <Money value={r.cr} blankZero />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )
              })}
              <tfoot>
                <tr>
                  <th scope="row" colSpan={showActivity ? 4 : 1}>
                    Total
                  </th>
                  <td className={styles.num}>
                    <Money value={totalDr} strong />
                  </td>
                  <td className={styles.num}>
                    <Money value={totalCr} strong />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

const formatMoneyPlain = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
