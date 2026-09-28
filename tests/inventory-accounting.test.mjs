/**
 * Inventory & accounting — database tests on VICKAR's real migrations, in an in-memory
 * Postgres (PGlite). Nothing external is touched.   npm run test:db
 */
import { PGlite } from "@electric-sql/pglite"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { before, describe, test } from "node:test"

const sql = (f) => readFileSync(new URL(`../supabase/${f}`, import.meta.url), "utf8")
const ADMIN = "00000000-0000-0000-0000-00000000000a"
const CUSTOMER = "00000000-0000-0000-0000-00000000000c"

const STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select nullif(current_setting('test.role', true), '') $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  grant usage on schema public to anon, authenticated, service_role;
`

let db
const one = async (q, p) => (await db.query(q, p)).rows[0]
const stock = async (id) => (await one(`select stock from public.products where id = $1`, [id])).stock
const move = (product, type, qty, extra = {}) =>
  db.query(
    `insert into public.inventory_movements (product_id, product_name, type, quantity, unit_cost, reason)
     select id, name, $2, $3, $4, $5 from public.products where id = $1 returning id`,
    [product, type, qty, extra.cost ?? 0, extra.reason ?? null],
  )

async function paidOrder(items) {
  const o = await one(
    `insert into public.orders (number, status, email, customer_name, shipping_address, items, subtotal, shipping, total)
     values ('VK-T-' || floor(random()*1e6), 'paid', 'c@x.co', 'C', '{}'::jsonb, $1::jsonb, 0, 0, 0) returning id`,
    [JSON.stringify(items)],
  )
  return o.id
}

before(async () => {
  db = new PGlite()
  await db.exec(STUBS)
  await db.exec(sql("schema.sql"))
  await db.exec(sql("migrations/002_customer_accounts.sql"))
  // Simulate an install that still has the previous accounting version
  await db.exec(`create table public.journal_entries (id int); create table public.accounts (id int);`)
  await db.exec(`insert into auth.users values ('${ADMIN}', 'a@x.co'), ('${CUSTOMER}', 'c@x.co'); insert into public.admins values ('${ADMIN}');`)
  await db.exec(sql("migrations/004_inventory_accounting.sql"))
  await db.exec(sql("migrations/004_inventory_accounting.sql")) // re-run must be safe
  await db.exec(`grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;`)
})

describe("migration", () => {
  test("removes the previous accounting tables", async () => {
    const r = await one(`select count(*)::int n from information_schema.tables where table_schema='public' and table_name in ('journal_entries','accounts')`)
    assert.equal(r.n, 0)
  })

  test("existing stock became an opening balance, exactly once", async () => {
    const r = await one(`select count(*)::int n, sum(quantity)::int q from public.inventory_movements where product_id = 'stride-pro'`)
    assert.deepEqual(r, { n: 1, q: 12 })
    assert.equal(await stock("stride-pro"), 12)
  })

  test("products without movements stay untracked (null stock)", async () => {
    assert.equal(await stock("arc-750"), null)
  })
})

describe("stock = sum of movements", () => {
  test("receipts add, other outputs remove, deleting a movement recalculates", async () => {
    await move("arc-750", "opening_stock", 10, { cost: 9.5 })
    const r = await move("arc-750", "received", 5, { cost: 9.5 })
    await move("arc-750", "other_out", -2, { reason: "Damaged in transit" })
    assert.equal(await stock("arc-750"), 13)
    await db.query(`delete from public.inventory_movements where id = $1`, [r.rows[0].id])
    assert.equal(await stock("arc-750"), 8)
  })

  test("signs are enforced per movement type", async () => {
    await assert.rejects(move("arc-750", "received", -1), /inventory_quantity_sign/)
    await assert.rejects(move("arc-750", "other_out", 3), /inventory_quantity_sign/)
    await move("arc-750", "adjustment", -1, { reason: "Count correction" })
    assert.equal(await stock("arc-750"), 7)
  })

  test("removing every movement returns the product to untracked", async () => {
    await move("arc-500", "opening_stock", 4)
    assert.equal(await stock("arc-500"), 4)
    await db.query(`delete from public.inventory_movements where product_id = 'arc-500'`)
    assert.equal(await stock("arc-500"), null)
  })
})

describe("sales", () => {
  test("a paid order deducts stock once, even if the webhook repeats", async () => {
    const before = await stock("arc-750")
    const orderId = await paidOrder([
      { productId: "arc-750", qty: 2, unitPrice: 39, unitCost: 9.5 },
      { productId: "arc-750", qty: 1, unitPrice: 39, unitCost: 9.5 }, // second colour line
      { productId: "solace", qty: 1, unitPrice: 89, unitCost: 30 },   // untracked product
    ])
    for (let i = 0; i < 3; i++) await db.query(`select public.record_sale_movements($1)`, [orderId])
    assert.equal(await stock("arc-750"), before - 3)
    const sales = await one(`select count(*)::int n, sum(quantity)::int q, max(unit_cost)::float c from public.inventory_movements where order_id = $1`, [orderId])
    assert.deepEqual(sales, { n: 1, q: -3, c: 9.5 })
    assert.equal(await stock("solace"), null) // not tracked → no movement created
  })
})

describe("security", () => {
  const asRole = async (uid, fn) => {
    await db.query(`select set_config('test.uid', $1, false), set_config('test.role', 'authenticated', false)`, [uid])
    await db.exec("set role authenticated")
    try {
      return await fn()
    } finally {
      await db.exec("reset role")
      await db.query(`select set_config('test.uid', '', false), set_config('test.role', '', false)`)
    }
  }

  test("customers can't see or write inventory, expenses or partners", async () => {
    await asRole(CUSTOMER, async () => {
      assert.equal((await one(`select count(*)::int n from public.inventory_movements`)).n, 0)
      await assert.rejects(db.query(`insert into public.expenses (description, amount) values ('x', 1)`), /row-level security/)
      await assert.rejects(db.query(`insert into public.business_partners (name, share_pct) values ('x', 50)`), /row-level security/)
    })
  })

  test("admins can record expenses and partners", async () => {
    await asRole(ADMIN, async () => {
      await db.query(`insert into public.expenses (description, amount, category) values ('Packaging', 12.5, 'Packaging')`)
      await db.query(`insert into public.business_partners (name, share_pct) values ('Partner A', 50), ('Partner B', 50)`)
      assert.ok((await one(`select count(*)::int n from public.inventory_movements`)).n > 0)
    })
  })

  test("customers can't call the sale function", async () => {
    await asRole(CUSTOMER, async () => {
      await assert.rejects(db.query(`select public.record_sale_movements(gen_random_uuid())`), /permission denied/)
    })
  })
})
