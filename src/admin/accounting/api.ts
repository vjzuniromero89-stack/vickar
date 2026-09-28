import { supabase } from "../../lib/supabase"

/**
 * Accounting data access. Reads go through Row Level Security; every write goes through the
 * database's security-definer functions (create/post/reverse…), which enforce double entry,
 * immutability, periods and permissions. The browser never writes journal rows directly.
 */

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense"

export type Account = {
  id: string
  code: string
  name: string
  type: AccountType
  subtype: string
  normal_balance: "debit" | "credit"
  parent_id: string | null
  system_key: string | null
  description: string
  is_active: boolean
}

export type EntryStatus = "draft" | "posted" | "void"

export type JournalLine = {
  id: string
  line_no: number
  account_id: string
  debit: number
  credit: number
  description: string | null
  order_id: string | null
  product_id: string | null
  sku: string | null
  stripe_object_id: string | null
  reference: string | null
  account?: { code: string; name: string }
}

export type JournalEntry = {
  id: string
  entry_number: number | null
  entry_date: string
  status: EntryStatus
  source: string
  source_ref: string | null
  description: string
  memo: string | null
  reversal_of: string | null
  reversed_by: string | null
  created_origin: "user" | "system"
  created_at: string
  posted_at: string | null
  total: number
  lines?: JournalLine[]
}

export type TrialBalanceRow = {
  account_id: string
  code: string
  name: string
  type: AccountType
  subtype: string
  normal_balance: "debit" | "credit"
  opening: number
  debits: number
  credits: number
  closing: number
}

export type LedgerRow = {
  line_id: string
  entry_id: string
  entry_number: number
  entry_date: string
  source: string
  source_ref: string | null
  entry_description: string
  line_description: string | null
  debit: number
  credit: number
  running_balance: number
  order_id: string | null
  sku: string | null
  stripe_object_id: string | null
  reference: string | null
}

export type Period = {
  id: string
  period_start: string
  period_end: string
  status: "open" | "closed"
  closed_at: string | null
  reopened_at: string | null
  notes: string | null
}

export type AuditRow = {
  id: number
  occurred_at: string
  actor_id: string | null
  actor_role: string | null
  action: string
  table_name: string
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  reason: string | null
  source: string | null
}

export type LineInput = { account_id: string; debit: number; credit: number; description?: string; reference?: string }

const db = () => {
  if (!supabase) throw new Error("Accounting requires Supabase.")
  return supabase
}

/** Postgres error → readable message (our functions raise human-readable exceptions). */
function fail(error: { message: string } | null): never | void {
  if (error) throw new Error(error.message.replace(/^.*?ERROR:\s*/, ""))
}

const num = (v: unknown) => Number(v ?? 0)

export const accountingApi = {
  /** True when a backend is connected (Supabase in the app; an in-browser Postgres in the dev preview). */
  available: Boolean(supabase),

  async permissions(): Promise<Set<string>> {
    const { data, error } = await db().rpc("my_permissions")
    fail(error)
    return new Set((data as string[] | null) ?? [])
  },

  async accounts(): Promise<Account[]> {
    const { data, error } = await db().from("accounts").select("*").order("code")
    fail(error)
    return (data ?? []) as Account[]
  },

  async saveAccount(a: Partial<Account> & { code: string; name: string; type: AccountType; subtype: string }) {
    const row = {
      code: a.code.trim(),
      name: a.name.trim(),
      type: a.type,
      subtype: a.subtype,
      description: a.description ?? "",
      parent_id: a.parent_id || null,
      is_active: a.is_active ?? true,
    }
    const { error } = a.id ? await db().from("accounts").update(row).eq("id", a.id) : await db().from("accounts").insert(row)
    fail(error)
  },

  async setAccountActive(id: string, active: boolean) {
    const { error } = await db().from("accounts").update({ is_active: active }).eq("id", id)
    fail(error)
  },

  async entries(filter: { status?: EntryStatus | "all"; source?: string; from?: string; to?: string; q?: string; limit?: number }) {
    let query = db()
      .from("journal_entries")
      .select("*, journal_lines(debit)")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(filter.limit ?? 200)
    if (filter.status && filter.status !== "all") query = query.eq("status", filter.status)
    if (filter.source) query = query.eq("source", filter.source)
    if (filter.from) query = query.gte("entry_date", filter.from)
    if (filter.to) query = query.lte("entry_date", filter.to)
    // Characters with meaning in PostgREST filter syntax are stripped from free-text search
    const q = filter.q?.replace(/[,()%*\\]/g, " ").trim()
    if (q) {
      const n = Number(q.replace(/^#/, ""))
      query = Number.isInteger(n) && n > 0 ? query.eq("entry_number", n) : query.or(`description.ilike.%${q}%,source_ref.ilike.%${q}%`)
    }
    const { data, error } = await query
    fail(error)
    return (data ?? []).map(({ journal_lines, ...e }) => ({
      ...e,
      total: (journal_lines as { debit: number }[]).reduce((s, l) => s + num(l.debit), 0),
    })) as JournalEntry[]
  },

  async entry(id: string): Promise<JournalEntry | null> {
    const { data, error } = await db()
      .from("journal_entries")
      .select("*, journal_lines(*, accounts(code, name))")
      .eq("id", id)
      .maybeSingle()
    fail(error)
    if (!data) return null
    const { journal_lines, ...e } = data as JournalEntry & { journal_lines: (JournalLine & { accounts: { code: string; name: string } })[] }
    const lines = journal_lines
      .map(({ accounts, ...l }) => ({ ...l, debit: num(l.debit), credit: num(l.credit), account: accounts }))
      .sort((a, b) => a.line_no - b.line_no)
    return { ...e, lines, total: lines.reduce((s, l) => s + l.debit, 0) }
  },

  async createEntry(entry: { entry_date: string; description: string; memo?: string }, lines: LineInput[], post: boolean) {
    const { data, error } = await db().rpc("create_journal_entry", { p_entry: entry, p_lines: lines, p_post: post })
    fail(error)
    return data as string
  },

  async updateDraft(id: string, entry: { entry_date: string; description: string; memo?: string }, lines: LineInput[]) {
    const { error } = await db().rpc("update_draft_entry", { p_entry_id: id, p_entry: entry, p_lines: lines })
    fail(error)
  },

  async post(id: string) {
    const { error } = await db().rpc("post_journal_entry", { p_entry_id: id })
    fail(error)
  },

  async voidDraft(id: string, reason: string) {
    const { error } = await db().rpc("void_draft_entry", { p_entry_id: id, p_reason: reason })
    fail(error)
  },

  async reverse(id: string, date: string, reason: string) {
    const { data, error } = await db().rpc("reverse_journal_entry", { p_entry_id: id, p_date: date, p_reason: reason })
    fail(error)
    return data as string
  },

  async trialBalance(from: string, to: string): Promise<TrialBalanceRow[]> {
    const { data, error } = await db().rpc("trial_balance", { p_from: from, p_to: to })
    fail(error)
    return ((data ?? []) as TrialBalanceRow[]).map((r) => ({
      ...r,
      opening: num(r.opening),
      debits: num(r.debits),
      credits: num(r.credits),
      closing: num(r.closing),
    }))
  },

  async ledger(accountId: string, from: string, to: string) {
    const [rows, opening] = await Promise.all([
      db().rpc("general_ledger", { p_account_id: accountId, p_from: from, p_to: to }),
      db().rpc("account_opening_balance", { p_account_id: accountId, p_from: from }),
    ])
    fail(rows.error)
    fail(opening.error)
    return {
      opening: num(opening.data),
      rows: ((rows.data ?? []) as LedgerRow[]).map((r) => ({
        ...r,
        debit: num(r.debit),
        credit: num(r.credit),
        running_balance: num(r.running_balance),
      })),
    }
  },

  async periods(): Promise<Period[]> {
    const { data, error } = await db().from("accounting_periods").select("*").order("period_start", { ascending: false })
    fail(error)
    return (data ?? []) as Period[]
  },

  async draftCounts(): Promise<Record<string, number>> {
    const { data, error } = await db().from("journal_entries").select("entry_date").eq("status", "draft")
    fail(error)
    const counts: Record<string, number> = {}
    for (const r of data ?? []) {
      const month = String(r.entry_date).slice(0, 7)
      counts[month] = (counts[month] ?? 0) + 1
    }
    return counts
  },

  async closePeriod(periodStart: string, notes: string) {
    const { error } = await db().rpc("close_period", { p_period_start: periodStart, p_notes: notes || null })
    fail(error)
  },

  async reopenPeriod(periodStart: string, reason: string) {
    const { error } = await db().rpc("reopen_period", { p_period_start: periodStart, p_reason: reason })
    fail(error)
  },

  async audit(filter: { table?: string; recordId?: string; limit?: number }): Promise<AuditRow[]> {
    let query = db().from("audit_log").select("*").order("occurred_at", { ascending: false }).limit(filter.limit ?? 200)
    if (filter.table) query = query.eq("table_name", filter.table)
    if (filter.recordId) query = query.eq("record_id", filter.recordId)
    const { data, error } = await query
    fail(error)
    return (data ?? []) as AuditRow[]
  },
}

/** Subtypes allowed per account type (mirrors the database constraint). */
export const subtypesByType: Record<AccountType, { id: string; label: string }[]> = {
  asset: [
    { id: "cash", label: "Cash" },
    { id: "bank", label: "Bank" },
    { id: "payment_processor", label: "Payment processor (Stripe)" },
    { id: "receivable", label: "Accounts receivable" },
    { id: "inventory", label: "Inventory" },
    { id: "prepaid", label: "Prepaid expense" },
    { id: "other_current_asset", label: "Other current asset" },
    { id: "fixed_asset", label: "Fixed asset" },
    { id: "contra_asset", label: "Contra asset (e.g. depreciation)" },
  ],
  liability: [
    { id: "payable", label: "Accounts payable" },
    { id: "credit_card", label: "Credit card" },
    { id: "tax_payable", label: "Tax payable" },
    { id: "other_current_liability", label: "Other current liability" },
    { id: "long_term_liability", label: "Long-term liability" },
  ],
  equity: [
    { id: "equity", label: "Equity" },
    { id: "owner_draws", label: "Owner draws" },
    { id: "retained_earnings", label: "Retained earnings" },
  ],
  revenue: [
    { id: "revenue", label: "Revenue" },
    { id: "contra_revenue", label: "Contra revenue (discounts, returns)" },
    { id: "other_income", label: "Other income" },
  ],
  expense: [
    { id: "cogs", label: "Cost of goods sold" },
    { id: "operating_expense", label: "Operating expense" },
    { id: "other_expense", label: "Other expense" },
  ],
}

export const typeLabels: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses & COGS",
}

export const sourceLabels: Record<string, string> = {
  manual: "Manual",
  reversal: "Reversal",
  order: "Sale",
  payment_fee: "Stripe fee",
  refund: "Refund",
  dispute: "Dispute",
  payout: "Payout",
  inventory: "Inventory",
  purchase: "Purchase",
  expense: "Expense",
  transfer: "Transfer",
  equity: "Owner equity",
  return: "Return",
  opening_balance: "Opening balance",
  system: "System",
}

export const today = () => new Date().toLocaleDateString("en-CA") // YYYY-MM-DD in local time
export const monthStart = () => today().slice(0, 8) + "01"
export const yearStart = () => today().slice(0, 5) + "01-01"
