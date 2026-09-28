/**
 * DEV-ONLY accounting preview — not part of the production build (only index.html is built).
 * Runs VICKAR's real accounting migrations in an in-browser Postgres (PGlite) and points the
 * accounting UI at it, so the screens can be exercised against the actual database rules
 * (double entry, immutability, periods, permissions) without touching any real project.
 *
 *   npm run dev  →  http://localhost:5180/dev/accounting.html
 */
import { PGlite } from "@electric-sql/pglite"
import { StrictMode, useEffect } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/fraunces/opsz-italic.css"
import "@fontsource-variable/instrument-sans"
import "@fontsource/ibm-plex-mono/400.css"
import "../src/styles/tokens.css"
import "../src/styles/base.css"
import "../src/styles/layout.css"
import schema from "../supabase/schema.sql?raw"
import m002 from "../supabase/migrations/002_customer_accounts.sql?raw"
import m003 from "../supabase/migrations/003_accounting_core.sql?raw"
import { AccountingApp } from "../src/admin/accounting/AccountingApp"
import { accountingApi } from "../src/admin/accounting/api"
import { ConfirmProvider, ToastProvider } from "../src/admin/ui"
import { MotionProvider } from "../src/motion/MotionProvider"
import { RouterProvider, useRouter } from "../src/state/RouterContext"

/** PGlite returns DATE columns as Date objects; Supabase returns "YYYY-MM-DD" strings. */
const isoDate = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))

const OWNER = "00000000-0000-0000-0000-00000000000a"

// Idempotent: the preview database persists in this browser (IndexedDB) across reloads
const STUBS = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  end $$;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key, email text unique);
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create or replace function auth.role() returns text language sql stable as $$ select nullif(current_setting('test.role', true), '') $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text, public boolean);
  create table if not exists storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
`

const DB_NAME = "vickar-accounting-preview"

async function boot() {
  // ?reset starts from a clean database
  if (new URLSearchParams(location.search).has("reset")) {
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(`/pglite/${DB_NAME}`)
      req.onsuccess = req.onerror = req.onblocked = () => resolve(null)
    })
    history.replaceState(null, "", location.pathname + location.hash)
  }
  const db = new PGlite(`idb://${DB_NAME}`)
  await db.exec(STUBS)
  await db.exec(schema)
  await db.exec(m002)
  await db.exec(
    `insert into auth.users values ('${OWNER}', 'owner@vickar.dev') on conflict do nothing;
     insert into public.admins values ('${OWNER}') on conflict do nothing;`,
  )
  await db.exec(m003)
  await db.query(`select set_config('test.uid', $1, false), set_config('test.role', 'authenticated', false)`, [OWNER])

  const rows = async <T,>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows
  const run = async (q: string, p: unknown[] = []) => {
    try {
      return await db.query(q, p)
    } catch (e) {
      throw new Error((e as Error).message)
    }
  }

  // Same contract as the Supabase implementation, backed by SQL against the real functions
  Object.assign(accountingApi, {
    available: true,
    permissions: async () => new Set((await rows<{ p: string }>(`select public.my_permissions() p`)).map((r) => r.p)),
    accounts: async () => rows(`select * from public.accounts order by code`),
    saveAccount: async (a: { id?: string; code: string; name: string; type: string; subtype: string; description?: string; is_active?: boolean }) =>
      a.id
        ? run(`update public.accounts set code=$2, name=$3, type=$4, subtype=$5, description=$6 where id=$1`, [a.id, a.code, a.name, a.type, a.subtype, a.description ?? ""])
        : run(`insert into public.accounts (code, name, type, subtype, description) values ($1,$2,$3,$4,$5)`, [a.code, a.name, a.type, a.subtype, a.description ?? ""]),
    setAccountActive: (id: string, active: boolean) => run(`update public.accounts set is_active=$2 where id=$1`, [id, active]),
    entries: async (f: { status?: string; source?: string; from?: string; to?: string; q?: string }) =>
      (
        await rows<Record<string, unknown>>(
          `select e.*, coalesce((select sum(debit) from public.journal_lines l where l.entry_id = e.id), 0)::float as total
             from public.journal_entries e
            where ($1 = 'all' or e.status = $1) and ($2 = '' or e.source = $2)
              and ($3 = '' or e.entry_date >= $3::date) and ($4 = '' or e.entry_date <= $4::date)
              and ($5 = '' or e.description ilike '%'||$5||'%' or e.entry_number::text = ltrim($5, '#'))
            order by e.entry_date desc, e.created_at desc limit 200`,
          [f.status ?? "all", f.source ?? "", f.from ?? "", f.to ?? "", (f.q ?? "").trim()],
        )
      ).map((e) => ({ ...e, entry_date: isoDate(e.entry_date) })),
    entry: async (id: string) => {
      const [e] = await rows<Record<string, unknown>>(`select * from public.journal_entries where id = $1`, [id])
      if (!e) return null
      const lines = (
        await rows<Record<string, unknown>>(
          `select l.*, a.code, a.name from public.journal_lines l join public.accounts a on a.id = l.account_id where entry_id = $1 order by line_no`,
          [id],
        )
      ).map((l) => ({ ...l, debit: Number(l.debit), credit: Number(l.credit), account: { code: l.code, name: l.name } }))
      return { ...e, entry_date: isoDate(e.entry_date), lines, total: lines.reduce((s, l) => s + l.debit, 0) }
    },
    createEntry: async (entry: object, lines: object[], post: boolean) =>
      ((await run(`select public.create_journal_entry($1::jsonb, $2::jsonb, $3) id`, [JSON.stringify(entry), JSON.stringify(lines), post])).rows[0] as { id: string }).id,
    updateDraft: (id: string, entry: object, lines: object[]) =>
      run(`select public.update_draft_entry($1, $2::jsonb, $3::jsonb)`, [id, JSON.stringify(entry), JSON.stringify(lines)]),
    post: (id: string) => run(`select public.post_journal_entry($1)`, [id]),
    voidDraft: (id: string, reason: string) => run(`select public.void_draft_entry($1, $2)`, [id, reason]),
    reverse: async (id: string, date: string, reason: string) =>
      ((await run(`select public.reverse_journal_entry($1, $2::date, $3) id`, [id, date, reason])).rows[0] as { id: string }).id,
    trialBalance: async (from: string, to: string) =>
      (await rows<Record<string, unknown>>(`select * from public.trial_balance($1::date, $2::date)`, [from, to])).map((r) => ({
        ...r,
        opening: Number(r.opening),
        debits: Number(r.debits),
        credits: Number(r.credits),
        closing: Number(r.closing),
      })),
    ledger: async (accountId: string, from: string, to: string) => ({
      opening: Number((await rows<{ b: string }>(`select public.account_opening_balance($1, $2::date) b`, [accountId, from]))[0].b),
      rows: (await rows<Record<string, unknown>>(`select * from public.general_ledger($1, $2::date, $3::date)`, [accountId, from, to])).map((r) => ({
        ...r,
        entry_date: isoDate(r.entry_date),
        debit: Number(r.debit),
        credit: Number(r.credit),
        running_balance: Number(r.running_balance),
      })),
    }),
    periods: async () =>
      (await rows<Record<string, unknown>>(`select * from public.accounting_periods order by period_start desc`)).map((p) => ({
        ...p,
        period_start: isoDate(p.period_start),
      })),
    draftCounts: async () =>
      Object.fromEntries(
        (await rows<{ m: string; n: number }>(`select to_char(entry_date, 'YYYY-MM') m, count(*)::int n from public.journal_entries where status='draft' group by 1`)).map((r) => [r.m, r.n]),
      ),
    closePeriod: (p: string, notes: string) => run(`select public.close_period($1::date, $2)`, [p, notes]),
    reopenPeriod: (p: string, reason: string) => run(`select public.reopen_period($1::date, $2)`, [p, reason]),
    audit: async (f: { table?: string; recordId?: string }) =>
      rows(
        `select * from public.audit_log where ($1 = '' or table_name = $1) and ($2 = '' or record_id = $2) order by occurred_at desc, id desc limit 300`,
        [f.table ?? "", f.recordId ?? ""],
      ),
  })

  // A few realistic, clearly-labelled sample entries so every screen has something to show
  const post = (e: object, l: object[]) =>
    db.query(`select public.create_journal_entry($1::jsonb, $2::jsonb, true)`, [JSON.stringify(e), JSON.stringify(l)])
  const d = (offset: number) => new Date(Date.now() - offset * 86400000).toLocaleDateString("en-CA")
  await post({ entry_date: d(20), description: "SAMPLE · Owner's initial capital", source: "equity", idempotency_key: "sample:capital" }, [
    { account_code: "1020", debit: 5000 },
    { account_code: "3000", credit: 5000 },
  ])
  await post({ entry_date: d(12), description: "SAMPLE · Instagram ads", idempotency_key: "sample:ads" }, [
    { account_code: "6300", debit: 120 },
    { account_code: "1020", credit: 120 },
  ])
  await post({ entry_date: d(5), description: "SAMPLE · Software subscription", idempotency_key: "sample:software" }, [
    { account_code: "6400", debit: 29 },
    { account_code: "1020", credit: 29 },
  ])
}

function Screen() {
  const { route, go } = useRouter()
  useEffect(() => {
    if (route.name !== "admin" || route.view !== "accounting") go("#/admin/accounting/journal")
  }, [route, go])
  if (route.name !== "admin" || route.view !== "accounting") return null
  return (
    <main style={{ maxWidth: "78rem", margin: "0 auto", padding: "2rem 1rem 6rem" }}>
      <p style={{ marginBottom: "1rem", padding: "0.6rem 1rem", borderRadius: 12, background: "rgb(143 216 255 / 0.1)", fontSize: 14 }}>
        Dev preview · in-browser Postgres with VICKAR's real accounting SQL. Nothing here reaches Supabase.
      </p>
      <AccountingApp sub={route.sub ?? "journal"} id={route.id} />
    </main>
  )
}

boot().then(() => {
  // Test hooks for scripted checks of the preview (dev only)
  Object.assign(window, { __acct: accountingApi, __ready: true })
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <MotionProvider>
        <RouterProvider>
          <ToastProvider>
            <ConfirmProvider>
              <Screen />
            </ConfirmProvider>
          </ToastProvider>
        </RouterProvider>
      </MotionProvider>
    </StrictMode>,
  )
})
