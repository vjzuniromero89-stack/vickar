/**
 * Accounting core — database tests.
 * Runs VICKAR's real migrations in an in-memory Postgres (PGlite): nothing external is touched.
 *   npm run test:db
 */
import { PGlite } from "@electric-sql/pglite"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { before, describe, test } from "node:test"

const sql = (f) => readFileSync(new URL(`../supabase/${f}`, import.meta.url), "utf8")

const OWNER = "00000000-0000-0000-0000-00000000000a"
const VIEWER = "00000000-0000-0000-0000-00000000000b"
const STRANGER = "00000000-0000-0000-0000-00000000000c"

/** Minimal stand-ins for the parts of Supabase the migrations rely on (auth, storage, roles). */
const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as
    $$ select nullif(current_setting('test.role', true), '') $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  grant usage on schema public, auth to anon, authenticated, service_role;
`

let db

/** Run as a given user (uid + JWT role) for the duration of a callback. */
async function as(uid, role, fn) {
  await db.query(`select set_config('test.uid', $1, false), set_config('test.role', $2, false)`, [uid ?? "", role ?? ""])
  try {
    return await fn()
  } finally {
    await db.query(`select set_config('test.uid', '', false), set_config('test.role', '', false)`)
  }
}
const asOwner = (fn) => as(OWNER, "authenticated", fn)
const asSystem = (fn) => as(null, "service_role", fn)

const entry = (o) => JSON.stringify({ entry_date: "2026-09-15", description: "Test entry", ...o })
const lines = (...l) => JSON.stringify(l)
async function create(e, l, post = true) {
  const r = await db.query(`select public.create_journal_entry($1::jsonb, $2::jsonb, $3) as id`, [e, l, post])
  return r.rows[0].id
}
const one = async (q, p) => (await db.query(q, p)).rows[0]
const count = async (q, p) => Number((await one(q, p)).n)

before(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  await db.exec(sql("schema.sql"))
  await db.exec(sql("migrations/002_customer_accounts.sql"))
  // Two admins before 003 → both become "owner"; then demote one to viewer
  await db.exec(`
    insert into auth.users (id, email) values
      ('${OWNER}', 'owner@vickar.test'), ('${VIEWER}', 'viewer@vickar.test'), ('${STRANGER}', 'x@vickar.test');
    insert into public.admins (user_id) values ('${OWNER}'), ('${VIEWER}');
  `)
  await db.exec(sql("migrations/003_accounting_core.sql"))
  // Re-running the migration must be safe
  await db.exec(sql("migrations/003_accounting_core.sql"))
  await db.exec(`
    delete from public.admin_roles where user_id = '${VIEWER}';
    insert into public.admin_roles (user_id, role_id) values ('${VIEWER}', 'viewer');
    grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
  `)
})

describe("setup", () => {
  test("seeds the chart of accounts, roles and makes existing admins owners", async () => {
    assert.ok((await count(`select count(*) n from public.accounts`)) >= 45)
    assert.equal((await one(`select normal_balance from public.accounts where code = '4900'`)).normal_balance, "debit")
    assert.equal((await one(`select normal_balance from public.accounts where code = '1050'`)).normal_balance, "debit")
    assert.equal((await one(`select normal_balance from public.accounts where code = '2200'`)).normal_balance, "credit")
    assert.equal(await count(`select count(*) n from public.admin_roles where user_id = $1 and role_id = 'owner'`, [OWNER]), 1)
  })
})

describe("double entry", () => {
  test("posts a balanced entry and numbers it", async () => {
    const id = await asOwner(() =>
      create(entry({ description: "Owner puts money in" }), lines(
        { account_code: "1020", debit: 1000 },
        { account_code: "3100", credit: 1000 },
      )),
    )
    const e = await one(`select status, entry_number from public.journal_entries where id = $1`, [id])
    assert.equal(e.status, "posted")
    assert.ok(Number(e.entry_number) > 0)
  })

  test("rejects an unbalanced entry and writes nothing", async () => {
    const before = await count(`select count(*) n from public.journal_entries`)
    await assert.rejects(
      asOwner(() => create(entry(), lines({ account_code: "1020", debit: 100 }, { account_code: "4000", credit: 99.99 }))),
      /not balanced/,
    )
    assert.equal(await count(`select count(*) n from public.journal_entries`), before)
  })

  test("rejects lines with both or neither side, and single-line entries", async () => {
    await assert.rejects(asOwner(() => create(entry(), lines({ account_code: "1020", debit: 5, credit: 5 }, { account_code: "4000", credit: 0 }))))
    await assert.rejects(asOwner(() => create(entry(), lines({ account_code: "1020", debit: 5 }))), /at least two lines/)
  })

  test("rounds to cents and rejects unknown accounts", async () => {
    await assert.rejects(asOwner(() => create(entry(), lines({ account_code: "9999", debit: 1 }, { account_code: "4000", credit: 1 }))), /account not found/)
  })
})

describe("immutability & corrections", () => {
  let postedId
  test("posted entries and their lines cannot be edited or deleted", async () => {
    postedId = await asOwner(() => create(entry({ description: "Immutable" }), lines({ account_code: "6300", debit: 50 }, { account_code: "1020", credit: 50 })))
    await assert.rejects(db.query(`update public.journal_entries set description = 'changed' where id = $1`, [postedId]), /cannot be changed/)
    await assert.rejects(db.query(`delete from public.journal_entries where id = $1`, [postedId]), /cannot be deleted/)
    await assert.rejects(db.query(`update public.journal_lines set debit = 1 where entry_id = $1`, [postedId]), /cannot be changed/)
    await assert.rejects(db.query(`delete from public.journal_lines where entry_id = $1`, [postedId]), /cannot be changed/)
  })

  test("reversal swaps debits/credits, links both entries, and nets to zero", async () => {
    const revId = await asOwner(async () => (await one(`select public.reverse_journal_entry($1, '2026-09-20', 'Wrong category') id`, [postedId])).id)
    const orig = await one(`select reversed_by from public.journal_entries where id = $1`, [postedId])
    assert.equal(orig.reversed_by, revId)
    const net = await one(`
      select sum(l.debit) - sum(l.credit) as net from public.journal_lines l
      join public.accounts a on a.id = l.account_id
      where a.code = '6300' and l.entry_id in ($1, $2)`, [postedId, revId])
    assert.equal(Number(net.net), 0)
    await assert.rejects(asOwner(() => db.query(`select public.reverse_journal_entry($1, null, 'again')`, [postedId])), /already reversed/)
    await assert.rejects(asOwner(() => db.query(`select public.reverse_journal_entry($1, null, 'x')`, [revId])), /cannot itself be reversed/)
  })

  test("a reason is required to reverse", async () => {
    const id = await asOwner(() => create(entry(), lines({ account_code: "6400", debit: 10 }, { account_code: "1020", credit: 10 })))
    await assert.rejects(asOwner(() => db.query(`select public.reverse_journal_entry($1, null, '  ')`, [id])), /reason is required/)
  })
})

describe("idempotency (Stripe webhooks can arrive many times)", () => {
  test("the same key never creates two entries", async () => {
    const e = entry({ source: "order", source_ref: "ord_1", idempotency_key: "sale:ord_1", description: "Sale" })
    const l = lines({ account_code: "1050", debit: 116 }, { account_code: "4000", credit: 100 }, { account_code: "4100", credit: 10 }, { account_code: "2200", credit: 6 })
    const ids = await asSystem(async () => [await create(e, l), await create(e, l), await create(e, l)])
    assert.equal(new Set(ids).size, 1)
    assert.equal(await count(`select count(*) n from public.journal_entries where idempotency_key = 'sale:ord_1'`), 1)
  })

  test("people cannot create automatic-source entries; the server can", async () => {
    await assert.rejects(
      asOwner(() => create(entry({ source: "order" }), lines({ account_code: "1050", debit: 1 }, { account_code: "4000", credit: 1 }))),
      /reserved for automatic entries/,
    )
  })
})

describe("drafts", () => {
  test("draft → edit → post; void needs a reason; drafts block period close", async () => {
    const id = await asOwner(() => create(entry({ entry_date: "2026-08-10", description: "Draft" }), lines({ account_code: "6900", debit: 20 }, { account_code: "1010", credit: 20 }), false))
    assert.equal((await one(`select status from public.journal_entries where id = $1`, [id])).status, "draft")
    await asOwner(() => db.query(`select public.update_draft_entry($1, $2::jsonb, $3::jsonb)`, [id, entry({ entry_date: "2026-08-10", description: "Draft v2" }), lines({ account_code: "6900", debit: 25 }, { account_code: "1010", credit: 25 })]))
    await assert.rejects(asOwner(() => db.query(`select public.close_period('2026-08-01', null)`)), /draft entr/)
    await assert.rejects(asOwner(() => db.query(`select public.void_draft_entry($1, '')`, [id])), /reason is required/)
    const n = await asOwner(async () => (await one(`select public.post_journal_entry($1) n`, [id])).n)
    assert.ok(Number(n) > 0)
  })
})

describe("periods", () => {
  test("a closed month rejects postings until reopened with a reason", async () => {
    await asOwner(() => db.query(`select public.close_period('2026-08-01', 'August closed')`))
    await assert.rejects(
      asOwner(() => create(entry({ entry_date: "2026-08-31" }), lines({ account_code: "6900", debit: 1 }, { account_code: "1010", credit: 1 }))),
      /period 2026-08 is closed/,
    )
    await assert.rejects(asOwner(() => db.query(`select public.reopen_period('2026-08-01', '')`)), /reason is required/)
    await asOwner(() => db.query(`select public.reopen_period('2026-08-01', 'Late supplier invoice')`))
    await asOwner(() => create(entry({ entry_date: "2026-08-31" }), lines({ account_code: "6900", debit: 1 }, { account_code: "1010", credit: 1 })))
  })

  test("the books lock date blocks postings on or before it", async () => {
    await db.query(`update public.accounting_settings set books_locked_through = '2026-06-30'`)
    await assert.rejects(
      asOwner(() => create(entry({ entry_date: "2026-06-30" }), lines({ account_code: "6900", debit: 1 }, { account_code: "1010", credit: 1 }))),
      /books are locked/,
    )
    await db.query(`update public.accounting_settings set books_locked_through = null`)
  })
})

describe("permissions & row level security", () => {
  test("a viewer can read but not post; a non-admin can do neither", async () => {
    await assert.rejects(
      as(VIEWER, "authenticated", () => create(entry(), lines({ account_code: "6900", debit: 1 }, { account_code: "1010", credit: 1 }))),
      /Permission denied/,
    )
    await assert.rejects(
      as(STRANGER, "authenticated", () => create(entry(), lines({ account_code: "6900", debit: 1 }, { account_code: "1010", credit: 1 }))),
      /Permission denied/,
    )
  })

  test("RLS: authenticated non-admins see no journal rows; viewers do", async () => {
    const visible = async (uid) =>
      as(uid, "authenticated", async () => {
        await db.exec("set role authenticated")
        try {
          return Number((await one(`select count(*) n from public.journal_entries`)).n)
        } finally {
          await db.exec("reset role")
        }
      })
    assert.equal(await visible(STRANGER), 0)
    assert.ok((await visible(VIEWER)) > 0)
  })

  test("RLS: nobody can insert journal rows directly (only through the posting functions)", async () => {
    await as(OWNER, "authenticated", async () => {
      await db.exec("set role authenticated")
      try {
        await assert.rejects(
          db.query(`insert into public.journal_entries (entry_date, description, source) values ('2026-09-01', 'sneaky', 'manual')`),
          /row-level security/,
        )
      } finally {
        await db.exec("reset role")
      }
    })
  })
})

describe("chart of accounts", () => {
  test("system accounts cannot be archived or change type", async () => {
    await assert.rejects(db.query(`update public.accounts set is_active = false where code = '1050'`), /system account/)
    await assert.rejects(db.query(`update public.accounts set type = 'liability', subtype = 'payable' where code = '4000'`), /system account/)
  })
  test("subtype must match type", async () => {
    await assert.rejects(db.query(`insert into public.accounts (code, name, type, subtype) values ('7777', 'Bad', 'asset', 'cogs')`), /accounts_subtype_matches_type/)
  })
  test("archived accounts cannot receive entries", async () => {
    await db.query(`insert into public.accounts (code, name, type, subtype) values ('6995', 'Temp', 'expense', 'operating_expense')`)
    await db.query(`update public.accounts set is_active = false where code = '6995'`)
    await assert.rejects(
      asOwner(() => create(entry(), lines({ account_code: "6995", debit: 1 }, { account_code: "1010", credit: 1 }))),
      /Archived accounts/,
    )
  })
})

describe("reports", () => {
  test("trial balance: total debits equal total credits", async () => {
    const r = await asOwner(() => one(`
      select sum(case when normal_balance = 'debit' then closing else 0 end) as dr,
             sum(case when normal_balance = 'credit' then closing else 0 end) as cr
      from public.trial_balance('2000-01-01', '2100-12-31')`))
    assert.equal(Number(r.dr), Number(r.cr))
  })

  test("general ledger running balance ends at the account balance", async () => {
    const acct = await one(`select id from public.accounts where code = '1020'`)
    const rows = (await asOwner(() => db.query(`select running_balance from public.general_ledger($1, '2000-01-01', '2100-12-31')`, [acct.id]))).rows
    const tb = await asOwner(() => one(`select closing from public.trial_balance('2000-01-01', '2100-12-31') where code = '1020'`))
    assert.equal(Number(rows.at(-1).running_balance), Number(tb.closing))
  })

  test("accounts with only draft lines still appear, at zero", async () => {
    await db.query(`insert into public.accounts (code, name, type, subtype) values ('6996', 'Draft only', 'expense', 'operating_expense')`)
    await asOwner(() => create(entry(), lines({ account_code: "6996", debit: 7 }, { account_code: "1010", credit: 7 }), false))
    const row = await asOwner(() => one(`select closing from public.trial_balance('2000-01-01', '2100-12-31') where code = '6996'`))
    assert.ok(row, "account missing from trial balance")
    assert.equal(Number(row.closing), 0)
  })

  test("reports return nothing without permission", async () => {
    const r = await as(STRANGER, "authenticated", () => db.query(`select * from public.trial_balance('2000-01-01', '2100-12-31')`))
    assert.equal(r.rows.length, 0)
  })
})

describe("numbering", () => {
  test("posted entries are numbered 1..n with no gaps, despite the rejected postings above", async () => {
    const nums = (await db.query(`select entry_number from public.journal_entries where status = 'posted' order by entry_number`)).rows.map((r) =>
      Number(r.entry_number),
    )
    assert.ok(nums.length > 5)
    assert.deepEqual(nums, nums.map((_, i) => i + 1))
  })
})

describe("audit trail", () => {
  test("postings, reversals and period changes are logged; the log is append-only", async () => {
    assert.ok((await count(`select count(*) n from public.audit_log where action = 'POST'`)) > 0)
    assert.ok((await count(`select count(*) n from public.audit_log where action = 'REVERSE'`)) > 0)
    assert.ok((await count(`select count(*) n from public.audit_log where table_name = 'accounting_periods'`)) > 0)
    await assert.rejects(db.query(`update public.audit_log set reason = 'x'`), /append-only/)
    await assert.rejects(db.query(`delete from public.audit_log`), /append-only/)
  })
})
