# VICKAR — Accounting

Double-entry bookkeeping built into the store's database (Supabase / Postgres).
Accrual basis · USD · monthly periods. **Review the configuration choices below with your accountant.**

## Principles (enforced by the database, not just the UI)

| Rule | How |
|---|---|
| Debits = credits | `create_journal_entry()` / `_post_entry()` refuse to post an unbalanced entry; one side per line (check constraint). |
| Posted entries are permanent | Triggers block UPDATE/DELETE of posted entries and their lines. Corrections = **reversal** + new entry. Drafts can be voided (kept, with reason). |
| No duplicates | Automatic entries carry a unique `idempotency_key` (e.g. `sale:<order>`, `refund:<re_…>`): a repeated Stripe webhook returns the existing entry. |
| Gapless numbering | Entry numbers come from a counter row updated in the posting transaction: 1, 2, 3… with no gaps. |
| Closed months stay closed | Posting into a closed period (or on/before `books_locked_through`) is rejected. Reopening needs `periods.reopen` and a reason. |
| Audit trail | `audit_log` is append-only (no one can edit or delete it): postings, reversals, voids, period changes, account and role changes. |
| Least privilege | Roles → permissions (`owner`, `accountant`, `operations`, `viewer`). Existing admins became `owner`. The browser can only read; all writes go through checked database functions. |

## Configuration (table `accounting_settings`)

| Setting | Value | Notes |
|---|---|---|
| Costing method | **Weighted average (perpetual)** | Fixed. Changing it requires an explicit data migration and, in the US, usually IRS Form 3115. Each sale will store the unit cost in effect at the time (Phase 2–3). |
| Outbound shipping (labels) | **COGS** | So gross margin includes the real cost of getting orders to customers. |
| Sales tax | **Off** | Sales Tax Payable stays at $0 until Stripe Tax is enabled; rates are never hard-coded. |
| Timezone | UTC | Set to your business timezone before go-live. |

## Chart of accounts

Seeded in `supabase/migrations/003_accounting_core.sql`. Accounts marked **System** (26) are used by automatic entries: they can be renamed but not re-typed or archived. Add your own accounts from **Admin → Accounting → Chart of accounts**. Accounts are archived, never deleted.

## Phases

1. **Core** ✅ — chart of accounts, journal, ledger, trial balance, periods, audit, roles.
2. Inventory & costing — stock movements ledger, receiving with landed cost, weighted average.
3. Sales & Stripe — automatic sale/COGS entries, real Stripe fees, payouts, disputes, reconciliation.
4. Returns & refunds — state machine, dispositions (restock / damaged / lost), refunds via Stripe.
5. Expenses & money accounts — vendors, receipts, transfers, owner equity, bank CSV reconciliation.
6. Dashboard & reports — P&L, balance sheet, cash flow, profitability by product/order.
7. Period close & hardening.

## Testing

```bash
npm run test:db
```

Runs the real migrations in an in-memory Postgres (PGlite) — nothing external is touched.
Dev preview of the accounting UI against the same SQL, in the browser: `npm run dev` → `/dev/accounting.html` (`?reset` to start clean).
