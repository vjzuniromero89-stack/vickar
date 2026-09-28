import { useEffect, useMemo, useState } from "react"
import { useRouter } from "../../state/RouterContext"
import adminStyles from "../admin.module.css"
import { accountingApi, monthStart, sourceLabels, today, typeLabels, type AccountType, type LedgerRow } from "./api"
import { useAccounting } from "./AccountingApp"
import { downloadCsv, formatDate, Money } from "./format"
import styles from "./accounting.module.css"

/** General ledger for one account: opening balance, every posted line, running balance, closing. */
export function Ledger({ accountId }: { accountId?: string }) {
  const { accounts, accountById } = useAccounting()
  const { go } = useRouter()
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [q, setQ] = useState("")
  const [source, setSource] = useState("")
  const [data, setData] = useState<{ opening: number; rows: LedgerRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const account = accountId ? accountById(accountId) : undefined

  useEffect(() => {
    if (!accountId) return
    let cancelled = false
    setData(null)
    accountingApi
      .ledger(accountId, from, to)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [accountId, from, to])

  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return (data?.rows ?? []).filter(
      (r) =>
        (!source || r.source === source) &&
        words.every((w) =>
          [r.entry_number, r.entry_description, r.line_description, r.source_ref, r.reference, r.sku, r.stripe_object_id]
            .join(" ")
            .toLowerCase()
            .includes(w),
        ),
    )
  }, [data, q, source])

  const debits = rows.reduce((s, r) => s + r.debit, 0)
  const credits = rows.reduce((s, r) => s + r.credit, 0)
  const closing = data?.rows.at(-1)?.running_balance ?? data?.opening ?? 0
  const filtered = rows.length !== (data?.rows.length ?? 0)

  return (
    <section className={styles.section} aria-labelledby="ledger-title">
      <div className={styles.sectionHead}>
        <h2 id="ledger-title" className="t-h3">
          General ledger{account ? ` · ${account.code} ${account.name}` : ""}
        </h2>
        {data && account && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() =>
              downloadCsv(`ledger-${account.code}-${from}-to-${to}.csv`, [
                ["Date", "Entry", "Source", "Description", "Line", "Debit", "Credit", "Balance"],
                ["", "", "", "Opening balance", "", "", "", data.opening.toFixed(2)],
                ...rows.map((r) => [
                  r.entry_date,
                  r.entry_number,
                  sourceLabels[r.source] ?? r.source,
                  r.entry_description,
                  r.line_description,
                  r.debit.toFixed(2),
                  r.credit.toFixed(2),
                  r.running_balance.toFixed(2),
                ]),
              ])
            }
          >
            Export CSV
          </button>
        )}
      </div>

      <div className={styles.filters}>
        <label className={styles.filterField}>
          <span>Account</span>
          <select value={accountId ?? ""} onChange={(e) => go(`#/admin/accounting/ledger/${e.target.value}`)}>
            <option value="">Choose an account…</option>
            {(Object.keys(typeLabels) as AccountType[]).map((t) => (
              <optgroup key={t} label={typeLabels[t]}>
                {accounts
                  .filter((a) => a.type === t)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                      {a.is_active ? "" : " (archived)"}
                    </option>
                  ))}
              </optgroup>
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
        <label className={styles.filterField}>
          <span>Source</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All</option>
            {Object.entries(sourceLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={adminStyles.search}>
          <span className="sr-only">Filter lines</span>
          <input type="search" placeholder="Order, SKU, Stripe id, reference…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {error && (
        <p className={adminStyles.errorBanner} role="alert">
          {error}
        </p>
      )}

      {!accountId ? (
        <div className={adminStyles.emptyState}>
          <p className="t-h3">Choose an account</p>
          <p className="t-soft">Or open one from the Chart of accounts or the Trial balance.</p>
        </div>
      ) : !data ? (
        <p className="t-soft">Loading…</p>
      ) : (
        <>
          <dl className={styles.summary}>
            <div>
              <dt>Opening balance</dt>
              <dd>
                <Money value={data.opening} strong />
              </dd>
            </div>
            <div>
              <dt>Debits</dt>
              <dd>
                <Money value={debits} />
              </dd>
            </div>
            <div>
              <dt>Credits</dt>
              <dd>
                <Money value={credits} />
              </dd>
            </div>
            <div>
              <dt>Closing balance</dt>
              <dd>
                <Money value={closing} strong />
              </dd>
            </div>
          </dl>
          {account && (
            <p className={adminStyles.hint}>
              Balances are shown in the account's normal direction ({account.normal_balance}): positive means a normal{" "}
              {account.normal_balance} balance.{filtered ? " Filters hide some lines; the running balance still includes them." : ""}
            </p>
          )}

          {rows.length === 0 ? (
            <p className="t-soft">No posted movements in this range.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">#</th>
                    <th scope="col">Description</th>
                    <th scope="col">Source</th>
                    <th scope="col" className={styles.num}>
                      Debit
                    </th>
                    <th scope="col" className={styles.num}>
                      Credit
                    </th>
                    <th scope="col" className={styles.num}>
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line_id}>
                      <td className={styles.nowrap}>{formatDate(r.entry_date)}</td>
                      <td className={styles.mono}>
                        <a href={`#/admin/accounting/journal/${r.entry_id}`} className={styles.rowLink}>
                          {r.entry_number}
                        </a>
                      </td>
                      <td>
                        {r.entry_description}
                        {r.line_description && <span className="t-small t-soft"> · {r.line_description}</span>}
                      </td>
                      <td className="t-small t-soft">{sourceLabels[r.source] ?? r.source}</td>
                      <td className={styles.num}>
                        <Money value={r.debit} blankZero />
                      </td>
                      <td className={styles.num}>
                        <Money value={r.credit} blankZero />
                      </td>
                      <td className={styles.num}>
                        <Money value={r.running_balance} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
