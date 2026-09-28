import { AnimatePresence, m } from "motion/react"
import { useEffect, useState, type FormEvent } from "react"
import { Icon } from "../../components/ui/Icon"
import { transition } from "../../motion/tokens"
import adminStyles from "../admin.module.css"
import { useToast } from "../ui"
import { accountingApi, subtypesByType, today, typeLabels, type Account, type AccountType } from "./api"
import { useAccounting } from "./AccountingApp"
import { Money } from "./format"
import styles from "./accounting.module.css"

/** Chart of accounts, grouped by type, with current balances. Accounts are archived, never deleted. */
export function ChartOfAccounts() {
  const { accounts, reloadAccounts, can } = useAccounting()
  const toast = useToast()
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [editing, setEditing] = useState<Partial<Account> | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const manage = can("accounts.manage")

  useEffect(() => {
    accountingApi
      .trialBalance("1900-01-01", today())
      .then((rows) => setBalances(Object.fromEntries(rows.map((r) => [r.account_id, r.closing]))))
      .catch(() => {})
  }, [accounts])

  const toggleActive = async (a: Account) => {
    try {
      await accountingApi.setAccountActive(a.id, !a.is_active)
      await reloadAccounts()
      toast(a.is_active ? `${a.code} archived` : `${a.code} reactivated`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the account.")
    }
  }

  return (
    <section className={styles.section} aria-labelledby="coa-title">
      <div className={styles.sectionHead}>
        <h2 id="coa-title" className="t-h3">
          Chart of accounts
        </h2>
        <div className={adminStyles.inlineActions}>
          <label className={styles.check}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
          </label>
          {manage && (
            <button type="button" className="btn btn--primary" onClick={() => setEditing({ type: "expense", subtype: "operating_expense" })}>
              <Icon name="plus" size={18} /> New account
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {editing && (
          <AccountForm
            key={editing.id ?? "new"}
            initial={editing}
            accounts={accounts}
            onCancel={() => setEditing(null)}
            onSaved={async (label) => {
              await reloadAccounts()
              toast(label)
              setEditing(null)
            }}
          />
        )}
      </AnimatePresence>

      {error && (
        <p className={adminStyles.errorBanner} role="alert">
          {error}
        </p>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Account</th>
              <th scope="col">Detail type</th>
              <th scope="col" className={styles.num}>
                Balance
              </th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          {(Object.keys(typeLabels) as AccountType[]).map((t) => {
            const group = accounts.filter((a) => a.type === t && (showArchived || a.is_active))
            return (
              <tbody key={t}>
                <tr className={styles.groupRow}>
                  <th scope="rowgroup" colSpan={5}>
                    {typeLabels[t]}
                  </th>
                </tr>
                {group.map((a) => (
                  <tr key={a.id} data-archived={!a.is_active}>
                    <td className={styles.mono}>{a.code}</td>
                    <td>
                      <a href={`#/admin/accounting/ledger/${a.id}`} className={styles.rowLink}>
                        {a.name}
                      </a>
                      {a.system_key && (
                        <span className={styles.tag} title="Used by automatic entries: its type can't change and it can't be archived">
                          System
                        </span>
                      )}
                      {!a.is_active && <span className={styles.tag}>Archived</span>}
                    </td>
                    <td className="t-small t-soft">
                      {subtypesByType[a.type].find((s) => s.id === a.subtype)?.label ?? a.subtype}
                    </td>
                    <td className={styles.num}>
                      <Money value={balances[a.id] ?? 0} blankZero />
                    </td>
                    <td className={styles.actionsCell}>
                      {manage && (
                        <>
                          <button type="button" className={adminStyles.iconButton} aria-label={`Edit ${a.name}`} onClick={() => setEditing(a)}>
                            <Icon name="edit" size={18} />
                          </button>
                          {!a.system_key && (
                            <button type="button" className={adminStyles.textButton} onClick={() => toggleActive(a)}>
                              {a.is_active ? "Archive" : "Reactivate"}
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            )
          })}
        </table>
      </div>
    </section>
  )
}

function AccountForm({
  initial,
  accounts,
  onCancel,
  onSaved,
}: {
  initial: Partial<Account>
  accounts: Account[]
  onCancel: () => void
  onSaved: (label: string) => Promise<void>
}) {
  const [a, setA] = useState<Partial<Account>>(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isSystem = Boolean(initial.system_key)
  const type = (a.type ?? "expense") as AccountType

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\d{3,6}$/.test(a.code ?? "")) return setError("Code must be 3–6 digits, e.g. 6310.")
    if (!a.name?.trim()) return setError("Give the account a name.")
    if (accounts.some((x) => x.code === a.code && x.id !== a.id)) return setError(`Code ${a.code} is already used.`)
    setBusy(true)
    try {
      await accountingApi.saveAccount({ ...a, code: a.code!, name: a.name!, type, subtype: a.subtype! })
      await onSaved(a.id ? `${a.code} updated` : `${a.code} ${a.name} created`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the account.")
      setBusy(false)
    }
  }

  return (
    <m.form
      className={adminStyles.panel}
      onSubmit={submit}
      noValidate
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0, transition: transition.exit }}
      transition={{ duration: 0.3 }}
      style={{ overflow: "hidden" }}
      aria-labelledby="acct-form-title"
    >
      <h3 id="acct-form-title" className="t-h3">
        {a.id ? `Edit ${initial.code} ${initial.name}` : "New account"}
      </h3>
      <div className={adminStyles.formRow}>
        <div className={adminStyles.field}>
          <label htmlFor="af-code">Code</label>
          <input id="af-code" inputMode="numeric" value={a.code ?? ""} onChange={(e) => setA({ ...a, code: e.target.value.trim() })} autoFocus />
        </div>
        <div className={adminStyles.field}>
          <label htmlFor="af-name">Name</label>
          <input id="af-name" value={a.name ?? ""} onChange={(e) => setA({ ...a, name: e.target.value })} />
        </div>
      </div>
      <div className={adminStyles.formRow}>
        <div className={adminStyles.field}>
          <label htmlFor="af-type">Type</label>
          <select
            id="af-type"
            value={type}
            disabled={isSystem}
            onChange={(e) => {
              const t = e.target.value as AccountType
              setA({ ...a, type: t, subtype: subtypesByType[t][0].id })
            }}
          >
            {(Object.keys(typeLabels) as AccountType[]).map((t) => (
              <option key={t} value={t}>
                {typeLabels[t]}
              </option>
            ))}
          </select>
        </div>
        <div className={adminStyles.field}>
          <label htmlFor="af-subtype">Detail type</label>
          <select id="af-subtype" value={a.subtype} disabled={isSystem} onChange={(e) => setA({ ...a, subtype: e.target.value })}>
            {subtypesByType[type].map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={adminStyles.field}>
        <label htmlFor="af-desc">Description (optional)</label>
        <input id="af-desc" value={a.description ?? ""} onChange={(e) => setA({ ...a, description: e.target.value })} />
      </div>
      {isSystem && <p className={adminStyles.hint}>System account: you can rename it, but its type is fixed because automatic entries depend on it.</p>}
      {error && (
        <p className={adminStyles.fieldError} role="alert">
          {error}
        </p>
      )}
      <div className={adminStyles.inlineActions}>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {a.id ? "Save account" : "Create account"}
        </button>
      </div>
    </m.form>
  )
}
