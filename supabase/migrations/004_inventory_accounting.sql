-- =============================================================================================
-- VICKAR — Products · Inventory · Accounting (practical model)
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
--  • Removes the earlier "Phase 1" double-entry tables/functions if they were installed
--  • Products: SKU, unit cost (entered manually), low-stock alert
--  • Inventory movements: every stock change is a movement; product stock = sum of movements
--  • Orders: COGS (cost at the time of sale), real Stripe fee/net, tax, discount, shipping cost
--  • Expenses and business partners (ownership %)
-- =============================================================================================

-- ---------- 0. Remove the previous accounting version (only if it exists) ----------------------

drop table if exists public.journal_lines, public.journal_entries, public.journal_numbering,
  public.accounting_periods, public.accounts, public.accounting_settings, public.audit_log,
  public.admin_roles, public.role_permissions, public.roles, public.permissions cascade;
drop sequence if exists public.journal_entry_number_seq;
drop function if exists public.has_permission(text), public.my_permissions(), public.require_permission(text),
  public.audit_log_immutable(), public.audit_row(), public.accounts_guard(), public.journal_entries_guard(),
  public.journal_lines_guard(), public.assert_date_open(date), public._post_entry(uuid),
  public.create_journal_entry(jsonb, jsonb, boolean), public.post_journal_entry(uuid),
  public.update_draft_entry(uuid, jsonb, jsonb), public.void_draft_entry(uuid, text),
  public.reverse_journal_entry(uuid, date, text), public.close_period(date, text), public.reopen_period(date, text),
  public.signed_amount(text, numeric, numeric), public.trial_balance(date, date),
  public.general_ledger(uuid, date, date), public.account_opening_balance(uuid, date) cascade;

-- ---------- 1. Products ------------------------------------------------------------------------

alter table public.products add column if not exists sku text;
alter table public.products add column if not exists unit_cost numeric(10,2) not null default 0 check (unit_cost >= 0);
alter table public.products add column if not exists low_stock_alert int not null default 2 check (low_stock_alert >= 0);

create unique index if not exists products_sku_unique on public.products (lower(sku)) where sku is not null and sku <> '';

-- ---------- 2. Inventory movements -------------------------------------------------------------
-- quantity is signed: + adds stock, − removes it.
--   opening_stock (+)  first physical count
--   received      (+)  purchases / restock
--   return        (+)  customer return put back in stock
--   sale          (−)  created automatically when an order is paid
--   other_out     (−)  damaged, lost, samples, personal use
--   adjustment    (±)  count corrections

create table if not exists public.inventory_movements (
  id           uuid primary key default gen_random_uuid(),
  product_id   text not null references public.products(id) on delete cascade,
  product_name text not null,
  sku          text,
  type         text not null check (type in ('opening_stock', 'received', 'return', 'sale', 'other_out', 'adjustment')),
  quantity     int  not null check (quantity <> 0),
  unit_cost    numeric(10,2) not null default 0 check (unit_cost >= 0),
  reason       text,
  order_id     uuid references public.orders(id) on delete set null,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  constraint inventory_quantity_sign check (
    (type in ('opening_stock', 'received', 'return') and quantity > 0) or
    (type in ('sale', 'other_out') and quantity < 0) or
    (type = 'adjustment')
  )
);

create index if not exists inventory_movements_product_idx on public.inventory_movements (product_id, created_at desc);
create index if not exists inventory_movements_created_idx on public.inventory_movements (created_at desc);
-- A paid order can never deduct the same product twice (Stripe retries webhooks)
create unique index if not exists inventory_sale_once on public.inventory_movements (order_id, product_id) where type = 'sale';

-- Product stock always equals the sum of its movements (null = not tracked yet)
create or replace function public.sync_product_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product text := coalesce(new.product_id, old.product_id);
begin
  update public.products p
     set stock = (select case when count(*) = 0 then null else sum(m.quantity) end
                    from public.inventory_movements m where m.product_id = v_product),
         updated_at = now()
   where p.id = v_product;
  if tg_op = 'UPDATE' and old.product_id <> new.product_id then
    update public.products p
       set stock = (select case when count(*) = 0 then null else sum(m.quantity) end
                      from public.inventory_movements m where m.product_id = old.product_id)
     where p.id = old.product_id;
  end if;
  return null;
end;
$$;

drop trigger if exists inventory_sync_stock on public.inventory_movements;
create trigger inventory_sync_stock after insert or update or delete on public.inventory_movements
  for each row execute function public.sync_product_stock();

-- Stock that existed before movements becomes an opening balance, once
insert into public.inventory_movements (product_id, product_name, sku, type, quantity, unit_cost, reason)
select p.id, p.name, p.sku, 'opening_stock', p.stock, p.unit_cost, 'Opening balance (existing stock)'
  from public.products p
 where p.stock is not null and p.stock > 0
   and not exists (select 1 from public.inventory_movements m where m.product_id = p.id);

-- ---------- 3. Orders: cost and fee data -------------------------------------------------------

alter table public.orders add column if not exists cogs          numeric(10,2) not null default 0;  -- Σ qty × unit cost at sale time
alter table public.orders add column if not exists stripe_fee    numeric(10,2);                     -- real fee reported by Stripe
alter table public.orders add column if not exists stripe_net    numeric(10,2);
alter table public.orders add column if not exists tax           numeric(10,2) not null default 0;  -- collected, owed to the state
alter table public.orders add column if not exists discount      numeric(10,2) not null default 0;
alter table public.orders add column if not exists shipping_cost numeric(10,2) not null default 0;  -- label paid by the business

create index if not exists orders_paid_idx on public.orders (paid_at desc) where paid_at is not null;

-- Called by the Stripe webhook when an order is paid: one sale movement per tracked product.
-- Idempotent (unique index above), so repeated webhooks never deduct twice.
create or replace function public.record_sale_movements(p_order_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.inventory_movements (product_id, product_name, sku, type, quantity, unit_cost, reason, order_id)
  select p.id, p.name, p.sku, 'sale', -sum((i ->> 'qty')::int), coalesce(max((i ->> 'unitCost')::numeric), p.unit_cost),
         'Order ' || o.number, o.id
    from public.orders o
    cross join lateral jsonb_array_elements(o.items) i
    join public.products p on p.id = i ->> 'productId'
   where o.id = p_order_id
     and p.stock is not null                -- only products whose stock is tracked
   group by p.id, p.name, p.sku, p.unit_cost, o.number, o.id
  on conflict (order_id, product_id) where type = 'sale' do nothing;
$$;

revoke execute on function public.record_sale_movements(uuid) from public, anon, authenticated;
grant execute on function public.record_sale_movements(uuid) to service_role;

-- ---------- 4. Expenses ------------------------------------------------------------------------

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  description  text not null check (length(trim(description)) > 0),
  category     text not null default 'Other',
  vendor       text,
  amount       numeric(10,2) not null check (amount > 0),
  created_by   uuid,
  created_at   timestamptz not null default now()
);

create index if not exists expenses_date_idx on public.expenses (expense_date desc);

-- ---------- 5. Business partners (ownership) ---------------------------------------------------

create table if not exists public.business_partners (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  share_pct  numeric(5,2) not null check (share_pct > 0 and share_pct <= 100),
  created_at timestamptz not null default now()
);

-- ---------- 6. Security: admins only -----------------------------------------------------------

alter table public.inventory_movements enable row level security;
alter table public.expenses            enable row level security;
alter table public.business_partners   enable row level security;

drop policy if exists "admins manage inventory" on public.inventory_movements;
create policy "admins manage inventory" on public.inventory_movements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage expenses" on public.expenses;
create policy "admins manage expenses" on public.expenses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage partners" on public.business_partners;
create policy "admins manage partners" on public.business_partners
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
