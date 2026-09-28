import { AnimatePresence, m } from "motion/react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { spring, transition } from "../../motion/tokens"
import type { AccountingView } from "../../state/RouterContext"
import { accountingApi, type Account } from "./api"
import { AuditLog } from "./AuditLog"
import { ChartOfAccounts } from "./ChartOfAccounts"
import { EntryDetail } from "./EntryDetail"
import { EntryForm } from "./EntryForm"
import { Journal } from "./Journal"
import { Ledger } from "./Ledger"
import { Periods } from "./Periods"
import { TrialBalance } from "./TrialBalance"
import styles from "./accounting.module.css"
import adminStyles from "../admin.module.css"

type AccountingContextValue = {
  can: (permission: string) => boolean
  accounts: Account[]
  accountById: (id: string) => Account | undefined
  reloadAccounts: () => Promise<void>
}

const AccountingContext = createContext<AccountingContextValue | null>(null)
export const useAccounting = () => {
  const ctx = useContext(AccountingContext)
  if (!ctx) throw new Error("useAccounting must be used inside <AccountingApp>")
  return ctx
}

const tabs: { id: AccountingView; label: string; hash: string; permission?: string }[] = [
  { id: "journal", label: "Journal", hash: "#/admin/accounting/journal" },
  { id: "ledger", label: "General ledger", hash: "#/admin/accounting/ledger" },
  { id: "trial-balance", label: "Trial balance", hash: "#/admin/accounting/trial-balance" },
  { id: "accounts", label: "Chart of accounts", hash: "#/admin/accounting/accounts" },
  { id: "periods", label: "Periods", hash: "#/admin/accounting/periods" },
  { id: "audit", label: "Audit log", hash: "#/admin/accounting/audit", permission: "audit.view" },
]

/** Accounting area inside the admin: shared permissions + chart of accounts, and its own tabs. */
export function AccountingApp({ sub, id }: { sub: AccountingView; id?: string }) {
  const [permissions, setPermissions] = useState<Set<string> | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState<string | null>(null)

  const reloadAccounts = useCallback(async () => {
    setAccounts(await accountingApi.accounts())
  }, [])

  useEffect(() => {
    if (!accountingApi.available) return
    Promise.all([accountingApi.permissions(), accountingApi.accounts()])
      .then(([p, a]) => {
        setPermissions(p)
        setAccounts(a)
      })
      .catch((e: Error) =>
        setError(
          /function .* does not exist|relation .* does not exist|schema cache/i.test(e.message)
            ? "The accounting tables aren't installed yet. Run supabase/migrations/003_accounting_core.sql in Supabase → SQL Editor."
            : e.message,
        ),
      )
  }, [])

  const value = useMemo<AccountingContextValue>(
    () => ({
      can: (p) => permissions?.has(p) ?? false,
      accounts,
      accountById: (aid) => accounts.find((a) => a.id === aid),
      reloadAccounts,
    }),
    [permissions, accounts, reloadAccounts],
  )

  if (!accountingApi.available) {
    return (
      <Shell sub={sub}>
        <div className={adminStyles.emptyState}>
          <p className="t-h3">Accounting needs the live backend.</p>
          <p className="t-soft">Connect Supabase (SETUP.md): the books live in the database, where double entry is enforced.</p>
        </div>
      </Shell>
    )
  }
  if (error) {
    return (
      <Shell sub={sub}>
        <p className={adminStyles.errorBanner} role="alert">
          {error}
        </p>
      </Shell>
    )
  }
  if (!permissions) {
    return (
      <Shell sub={sub}>
        <p className="t-soft">Loading the books…</p>
      </Shell>
    )
  }
  if (!permissions.has("accounting.view")) {
    return (
      <Shell sub={sub}>
        <div className={adminStyles.emptyState}>
          <p className="t-h3">You don't have access to accounting.</p>
          <p className="t-soft">Ask an owner to give your admin user an accounting role.</p>
        </div>
      </Shell>
    )
  }

  const activeTab = sub === "entry" || sub === "new-entry" ? "journal" : sub

  return (
    <AccountingContext.Provider value={value}>
      <Shell sub={activeTab} visibleTabs={tabs.filter((t) => !t.permission || permissions.has(t.permission))}>
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={`${sub}-${id ?? ""}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: transition.exit }}
            transition={{ duration: 0.2 }}
          >
            {sub === "journal" && <Journal />}
            {sub === "new-entry" && <EntryForm />}
            {sub === "entry" && id && <EntryDetail id={id} />}
            {sub === "ledger" && <Ledger accountId={id} />}
            {sub === "trial-balance" && <TrialBalance />}
            {sub === "accounts" && <ChartOfAccounts />}
            {sub === "periods" && <Periods />}
            {sub === "audit" && <AuditLog />}
          </m.div>
        </AnimatePresence>
      </Shell>
    </AccountingContext.Provider>
  )
}

function Shell({ sub, visibleTabs = tabs, children }: { sub: AccountingView; visibleTabs?: typeof tabs; children: ReactNode }) {
  return (
    <div className={adminStyles.page}>
      <header className={adminStyles.pageHead}>
        <div>
          <p className="t-label t-accent">Finance</p>
          <h1 className="t-h1">Accounting</h1>
        </div>
      </header>
      <nav aria-label="Accounting sections" className={styles.tabsWrap}>
        <ul className={styles.tabs}>
          {visibleTabs.map((t) => (
            <li key={t.id}>
              <a href={t.hash} className={styles.tab} aria-current={sub === t.id ? "page" : undefined}>
                {sub === t.id && <m.span layoutId="acct-tab" className={styles.tabPill} transition={spring.snap} />}
                <span className={styles.tabLabel}>{t.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  )
}
