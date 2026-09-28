-- =============================================================================================
-- VICKAR — Accounting core (Phase 1)
-- Run once in Supabase → SQL Editor (after schema.sql and 002_customer_accounts.sql).
-- Safe to re-run: idempotent DDL, seeds use ON CONFLICT DO NOTHING.
--
-- What this adds
--   • Roles & permissions for admins (existing admins become "owner")
--   • Chart of Accounts (extensible; "system" accounts are used by automatic entries)
--   • Journal entries + lines with double-entry enforced IN THE DATABASE
--   • Posted entries are immutable; corrections only via reversal entries
--   • Idempotency keys (a Stripe event / order can never post twice)
--   • Monthly accounting periods (close / reopen with reason)
--   • Append-only audit log
-- Money: numeric(14,2), USD. Nothing here posts financial data by itself.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- 1. Permissions
-- ---------------------------------------------------------------------------------------------

create table if not exists public.permissions (
  key         text primary key,
  description text not null
);

insert into public.permissions (key, description) values
  ('accounting.view',     'View accounting: journal, ledger, balances'),
  ('reports.view',        'View financial reports'),
  ('expenses.manage',     'Create and edit expenses'),
  ('inventory.manage',    'Receive stock and make inventory adjustments'),
  ('returns.process',     'Process returns (approve, receive, inspect)'),
  ('refunds.issue',       'Issue refunds to customers'),
  ('journal.create',      'Create draft journal entries'),
  ('journal.post',        'Post and reverse journal entries'),
  ('periods.close',       'Close accounting periods'),
  ('periods.reopen',      'Reopen closed accounting periods'),
  ('accounts.manage',     'Manage the chart of accounts'),
  ('accounting.settings', 'Change accounting settings'),
  ('audit.view',          'View the audit log'),
  ('users.manage',        'Assign admin roles')
on conflict (key) do nothing;

create table if not exists public.roles (
  id          text primary key,
  name        text not null,
  description text not null default ''
);

insert into public.roles (id, name, description) values
  ('owner',      'Owner',      'Full access, including closing periods and managing roles'),
  ('accountant', 'Accountant', 'Books, reports, expenses and period close'),
  ('operations', 'Operations', 'Inventory, returns and refunds'),
  ('viewer',     'Viewer',     'Read-only access to accounting and reports')
on conflict (id) do nothing;

create table if not exists public.role_permissions (
  role_id    text not null references public.roles(id) on delete cascade,
  permission text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission)
);

insert into public.role_permissions (role_id, permission)
select 'owner', key from public.permissions
on conflict do nothing;

insert into public.role_permissions (role_id, permission) values
  ('accountant', 'accounting.view'), ('accountant', 'reports.view'), ('accountant', 'expenses.manage'),
  ('accountant', 'journal.create'), ('accountant', 'journal.post'), ('accountant', 'periods.close'),
  ('accountant', 'accounts.manage'), ('accountant', 'audit.view'),
  ('operations', 'accounting.view'), ('operations', 'inventory.manage'), ('operations', 'returns.process'),
  ('operations', 'refunds.issue'),
  ('viewer', 'accounting.view'), ('viewer', 'reports.view')
on conflict do nothing;

create table if not exists public.admin_roles (
  user_id    uuid not null references public.admins(user_id) on delete cascade,
  role_id    text not null references public.roles(id) on delete restrict,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- Every existing admin becomes owner (keeps today's "admins can do everything" behaviour)
insert into public.admin_roles (user_id, role_id)
select user_id, 'owner' from public.admins
on conflict do nothing;

-- Server (service role) is always allowed; signed-in users need the permission through a role
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or exists (
        select 1
          from public.admin_roles ar
          join public.role_permissions rp on rp.role_id = ar.role_id
         where ar.user_id = auth.uid()
           and rp.permission = p_permission
      );
$$;

create or replace function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct rp.permission
    from public.admin_roles ar
    join public.role_permissions rp on rp.role_id = ar.role_id
   where ar.user_id = auth.uid();
$$;

create or replace function public.require_permission(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission(p_permission) then
    raise exception 'Permission denied: % is required', p_permission using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Audit log (append-only)
-- ---------------------------------------------------------------------------------------------

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_role  text,
  action      text not null,          -- INSERT / UPDATE / DELETE or a domain verb (POST, REVERSE, CLOSE…)
  table_name  text not null,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  reason      text,
  source      text                    -- 'user' | 'system' | 'stripe' …
);

create index if not exists audit_log_record_idx on public.audit_log (table_name, record_id, occurred_at desc);
create index if not exists audit_log_time_idx on public.audit_log (occurred_at desc);

create or replace function public.audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'The audit log is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

-- Generic row audit. Functions can attach a reason with: set_config('app.reason', '…', true)
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  v_id := coalesce(
    (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id',
    (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'user_id',
    (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'key'
  );
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, old_data, new_data, reason, source)
  values (
    auth.uid(),
    auth.role(),
    tg_op,
    tg_table_name,
    v_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    nullif(current_setting('app.reason', true), ''),
    case when coalesce(auth.role(), '') = 'service_role' then 'system' else 'user' end
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Accounting settings (single row)
-- ---------------------------------------------------------------------------------------------

create table if not exists public.accounting_settings (
  id                          boolean primary key default true check (id),
  base_currency               text not null default 'USD' check (base_currency = 'USD'),
  timezone                    text not null default 'UTC',
  fiscal_year_start_month     int  not null default 1 check (fiscal_year_start_month between 1 and 12),
  -- Fixed at go-live. Changing it requires an explicit data migration (see ACCOUNTING.md).
  costing_method              text not null default 'weighted_average' check (costing_method in ('weighted_average')),
  outbound_shipping_treatment text not null default 'cogs' check (outbound_shipping_treatment in ('cogs', 'operating_expense')),
  sales_tax_enabled           boolean not null default false,
  -- Nothing on or before this date can be posted, whatever the period status
  books_locked_through        date,
  updated_at                  timestamptz not null default now()
);

insert into public.accounting_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- 4. Chart of Accounts
-- ---------------------------------------------------------------------------------------------

create table if not exists public.accounts (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^[0-9]{3,6}$'),
  name           text not null check (length(trim(name)) > 0),
  type           text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  subtype        text not null check (subtype in (
                   'cash', 'bank', 'payment_processor', 'receivable', 'inventory', 'prepaid',
                   'other_current_asset', 'fixed_asset', 'contra_asset',
                   'payable', 'credit_card', 'tax_payable', 'other_current_liability', 'long_term_liability',
                   'equity', 'owner_draws', 'retained_earnings',
                   'revenue', 'contra_revenue', 'other_income',
                   'cogs', 'operating_expense', 'other_expense')),
  -- Contra accounts carry the opposite balance of their type
  normal_balance text generated always as (
                   case
                     when subtype in ('contra_revenue', 'owner_draws') then 'debit'
                     when subtype = 'contra_asset' then 'credit'
                     when type in ('asset', 'expense') then 'debit'
                     else 'credit'
                   end) stored,
  parent_id      uuid references public.accounts(id) on delete restrict,
  system_key     text unique,           -- used by automatic entries, e.g. 'stripe_clearing'
  description    text not null default '',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  constraint accounts_subtype_matches_type check (
    (type = 'asset'     and subtype in ('cash','bank','payment_processor','receivable','inventory','prepaid','other_current_asset','fixed_asset','contra_asset')) or
    (type = 'liability' and subtype in ('payable','credit_card','tax_payable','other_current_liability','long_term_liability')) or
    (type = 'equity'    and subtype in ('equity','owner_draws','retained_earnings')) or
    (type = 'revenue'   and subtype in ('revenue','contra_revenue','other_income')) or
    (type = 'expense'   and subtype in ('cogs','operating_expense','other_expense'))
  )
);

create index if not exists accounts_type_idx on public.accounts (type, code);

insert into public.accounts (code, name, type, subtype, system_key, description) values
  -- Assets
  ('1010', 'Cash on Hand',                         'asset', 'cash',                'cash',                  'Physical cash'),
  ('1020', 'Bank — Operating',                     'asset', 'bank',                'bank_operating',        'Main business bank account'),
  ('1050', 'Stripe Clearing',                      'asset', 'payment_processor',   'stripe_clearing',       'Money held by Stripe until paid out to the bank'),
  ('1100', 'Accounts Receivable',                  'asset', 'receivable',          'accounts_receivable',   ''),
  ('1200', 'Inventory — Available',                'asset', 'inventory',           'inventory',             'Sellable stock at cost'),
  ('1210', 'Inventory — In Transit',               'asset', 'inventory',           'inventory_in_transit',  'Purchased, not yet received'),
  ('1220', 'Inventory — Returns Pending Inspection','asset', 'inventory',          'inventory_returns',     'Returned units awaiting inspection'),
  ('1300', 'Prepaid Expenses',                     'asset', 'prepaid',             null,                    ''),
  ('1400', 'Other Current Assets',                 'asset', 'other_current_asset', null,                    ''),
  ('1500', 'Fixed Assets',                         'asset', 'fixed_asset',         null,                    ''),
  ('1590', 'Accumulated Depreciation',             'asset', 'contra_asset',        null,                    ''),
  -- Liabilities
  ('2000', 'Accounts Payable',                     'liability', 'payable',                 'accounts_payable', ''),
  ('2100', 'Credit Card Payable',                  'liability', 'credit_card',             null,               ''),
  ('2200', 'Sales Tax Payable',                    'liability', 'tax_payable',             'sales_tax_payable','Tax collected from customers, owed to tax authorities'),
  ('2300', 'Refunds Payable',                      'liability', 'other_current_liability', 'refunds_payable',  'Refunds approved but not yet paid'),
  ('2400', 'Customer Deposits',                    'liability', 'other_current_liability', null,               ''),
  ('2900', 'Other Liabilities',                    'liability', 'other_current_liability', null,               ''),
  -- Equity
  ('3000', 'Owner Capital',                        'equity', 'equity',            'owner_capital',     ''),
  ('3100', 'Owner Contributions',                  'equity', 'equity',            'owner_contributions',''),
  ('3200', 'Owner Draws / Distributions',          'equity', 'owner_draws',       'owner_draws',       ''),
  ('3800', 'Retained Earnings',                    'equity', 'retained_earnings', 'retained_earnings', ''),
  -- Revenue
  ('4000', 'Product Sales',                        'revenue', 'revenue',        'product_sales',      ''),
  ('4100', 'Shipping Revenue',                     'revenue', 'revenue',        'shipping_revenue',   'Shipping charged to customers'),
  ('4200', 'Restocking Fee Revenue',               'revenue', 'revenue',        'restocking_revenue', ''),
  ('4800', 'Discounts',                            'revenue', 'contra_revenue', 'discounts',          ''),
  ('4900', 'Sales Returns & Allowances',           'revenue', 'contra_revenue', 'sales_returns',      ''),
  -- Cost of goods sold
  ('5000', 'Product COGS',                         'expense', 'cogs', 'cogs',                  'Cost of products sold'),
  ('5100', 'Landed Cost Variance',                 'expense', 'cogs', 'landed_cost_variance',  'Late freight/duties on units already sold'),
  ('5200', 'Inventory Shrinkage — Damaged/Lost',   'expense', 'cogs', 'inventory_shrinkage',   ''),
  ('5300', 'Outbound Shipping & Fulfilment',       'expense', 'cogs', 'outbound_shipping',     'Carrier labels for customer orders'),
  -- Operating expenses
  ('6000', 'Payment Processing Fees',              'expense', 'operating_expense', 'payment_fees',     'Stripe fees (real amounts from Stripe)'),
  ('6010', 'Chargebacks & Dispute Fees',           'expense', 'operating_expense', 'dispute_losses',   ''),
  ('6100', 'Shipping Expense',                     'expense', 'operating_expense', 'shipping_expense', 'Return labels paid by the company, etc.'),
  ('6200', 'Packaging',                            'expense', 'operating_expense', null, ''),
  ('6300', 'Advertising',                          'expense', 'operating_expense', null, ''),
  ('6400', 'Software',                             'expense', 'operating_expense', null, ''),
  ('6500', 'Payroll',                              'expense', 'operating_expense', null, ''),
  ('6550', 'Contractors',                          'expense', 'operating_expense', null, ''),
  ('6600', 'Rent',                                 'expense', 'operating_expense', null, ''),
  ('6650', 'Utilities',                            'expense', 'operating_expense', null, ''),
  ('6700', 'Professional Services',                'expense', 'operating_expense', null, ''),
  ('6750', 'Insurance',                            'expense', 'operating_expense', null, ''),
  ('6800', 'Repairs & Maintenance',                'expense', 'operating_expense', null, ''),
  ('6850', 'Travel',                               'expense', 'operating_expense', null, ''),
  ('6900', 'Office & Supplies',                    'expense', 'operating_expense', null, ''),
  ('6990', 'Other Expenses',                       'expense', 'operating_expense', null, '')
on conflict (code) do nothing;

-- System accounts keep their meaning: no type/subtype changes, no archiving
create or replace function public.accounts_guard()
returns trigger language plpgsql as $$
begin
  if old.system_key is not null then
    if new.type <> old.type or new.subtype <> old.subtype or new.is_active = false
       or new.system_key is distinct from old.system_key then
      raise exception 'Account % is a system account: its type cannot change and it cannot be archived', old.code
        using errcode = '42501';
    end if;
  end if;
  if new.type <> old.type and exists (select 1 from public.journal_lines where account_id = old.id) then
    raise exception 'Account % already has entries; its type cannot change', old.code using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists accounts_guard on public.accounts;

-- ---------------------------------------------------------------------------------------------
-- 5. Accounting periods (one per calendar month)
-- ---------------------------------------------------------------------------------------------

create table if not exists public.accounting_periods (
  id           uuid primary key default gen_random_uuid(),
  period_start date not null unique check (extract(day from period_start) = 1),
  period_end   date generated always as ((period_start + interval '1 month - 1 day')::date) stored,
  status       text not null default 'open' check (status in ('open', 'closed')),
  closed_at    timestamptz,
  closed_by    uuid,
  reopened_at  timestamptz,
  reopened_by  uuid,
  notes        text
);

-- ---------------------------------------------------------------------------------------------
-- 6. Journal
-- ---------------------------------------------------------------------------------------------

-- Gapless entry numbers: a counter row updated in the posting transaction. If the posting
-- fails, the transaction rolls back and the number is not consumed (unlike a sequence).
create table if not exists public.journal_numbering (
  id          boolean primary key default true check (id),
  last_number bigint not null default 0 check (last_number >= 0)
);

create table if not exists public.journal_entries (
  id              uuid primary key default gen_random_uuid(),
  entry_number    bigint unique,                  -- assigned when posted: 1, 2, 3… with no gaps
  entry_date      date not null,
  status          text not null default 'draft' check (status in ('draft', 'posted', 'void')),
  source          text not null check (source in (
                    'manual', 'reversal', 'order', 'payment_fee', 'refund', 'dispute', 'payout',
                    'inventory', 'purchase', 'expense', 'transfer', 'equity', 'return', 'opening_balance', 'system')),
  source_ref      text,                           -- order id, Stripe object id, expense id…
  idempotency_key text unique,                    -- e.g. 'sale:<order_id>', 'stripe_fee:<txn_…>'
  description     text not null check (length(trim(description)) > 0),
  memo            text,
  reversal_of     uuid unique references public.journal_entries(id) on delete restrict,
  reversed_by     uuid references public.journal_entries(id) on delete restrict,
  created_origin  text not null default 'user' check (created_origin in ('user', 'system')),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  posted_at       timestamptz,
  posted_by       uuid,
  constraint journal_posted_has_number check ((status = 'posted') = (entry_number is not null))
);

insert into public.journal_numbering (id, last_number)
select true, coalesce(max(entry_number), 0) from public.journal_entries
on conflict (id) do update set last_number = greatest(public.journal_numbering.last_number, excluded.last_number);

create index if not exists journal_entries_date_idx   on public.journal_entries (entry_date, entry_number);
create index if not exists journal_entries_source_idx on public.journal_entries (source, source_ref);
create index if not exists journal_entries_status_idx on public.journal_entries (status);

create table if not exists public.journal_lines (
  id               uuid primary key default gen_random_uuid(),
  entry_id         uuid not null references public.journal_entries(id) on delete cascade,
  line_no          int  not null,
  account_id       uuid not null references public.accounts(id) on delete restrict,
  debit            numeric(14,2) not null default 0 check (debit >= 0),
  credit           numeric(14,2) not null default 0 check (credit >= 0),
  description      text,
  -- Traceability (all optional). Products are referenced by id + SKU snapshot, without a hard FK,
  -- so deleting a product from the catalogue never breaks historical books.
  order_id         uuid references public.orders(id) on delete restrict,
  product_id       text,
  sku              text,
  customer_id      uuid,
  stripe_object_id text,
  reference        text,
  created_at       timestamptz not null default now(),
  constraint journal_lines_one_side check ((debit > 0) <> (credit > 0)),
  unique (entry_id, line_no)
);

create index if not exists journal_lines_account_idx on public.journal_lines (account_id);
create index if not exists journal_lines_entry_idx   on public.journal_lines (entry_id);
create index if not exists journal_lines_order_idx   on public.journal_lines (order_id) where order_id is not null;
create index if not exists journal_lines_product_idx on public.journal_lines (product_id) where product_id is not null;
create index if not exists journal_lines_stripe_idx  on public.journal_lines (stripe_object_id) where stripe_object_id is not null;

-- Posted entries are immutable. The only allowed change is linking a reversal (reversed_by, once).
create or replace function public.journal_entries_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Journal entry % is %; it cannot be deleted. Reverse it instead.', coalesce(old.entry_number::text, old.id::text), old.status
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.status = 'posted' then
    if (to_jsonb(new) - 'reversed_by') is distinct from (to_jsonb(old) - 'reversed_by')
       or old.reversed_by is not null then
      raise exception 'Journal entry % is posted and cannot be changed. Reverse it instead.', old.entry_number
        using errcode = '42501';
    end if;
  elsif old.status = 'void' then
    raise exception 'Voided entries cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists journal_entries_guard on public.journal_entries;
create trigger journal_entries_guard before update or delete on public.journal_entries
  for each row execute function public.journal_entries_guard();

-- Lines can only change while their entry is a draft
create or replace function public.journal_lines_guard()
returns trigger language plpgsql as $$
declare
  v_status text;
begin
  select status into v_status from public.journal_entries
   where id = coalesce(new.entry_id, old.entry_id);
  -- Parent already deleted (cascade from a draft) → allow
  if v_status is null then
    return coalesce(new, old);
  end if;
  if v_status <> 'draft' then
    raise exception 'Lines of a % entry cannot be changed', v_status using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists journal_lines_guard on public.journal_lines;
create trigger journal_lines_guard before insert or update or delete on public.journal_lines
  for each row execute function public.journal_lines_guard();

drop trigger if exists accounts_guard on public.accounts;
create trigger accounts_guard before update on public.accounts
  for each row execute function public.accounts_guard();

-- ---------------------------------------------------------------------------------------------
-- 7. Posting engine
-- ---------------------------------------------------------------------------------------------

-- Is this date open for posting? (period not closed and after the books lock date)
create or replace function public.assert_date_open(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock date;
  v_status text;
begin
  select books_locked_through into v_lock from public.accounting_settings where id;
  if v_lock is not null and p_date <= v_lock then
    raise exception 'The books are locked through %; % cannot be posted', v_lock, p_date using errcode = '42501';
  end if;
  insert into public.accounting_periods (period_start)
  values (date_trunc('month', p_date)::date)
  on conflict (period_start) do nothing;
  select status into v_status from public.accounting_periods where period_start = date_trunc('month', p_date)::date;
  if v_status = 'closed' then
    raise exception 'The period % is closed; reopen it or post in an open period', to_char(p_date, 'YYYY-MM') using errcode = '42501';
  end if;
end;
$$;

-- Validates balance, accounts and period, then assigns the entry number. Internal (no permission check).
create or replace function public._post_entry(p_entry_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.journal_entries;
  v_debits numeric(14,2);
  v_credits numeric(14,2);
  v_lines int;
  v_inactive text;
  v_number bigint;
begin
  select * into v_entry from public.journal_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Journal entry not found' using errcode = 'P0002';
  end if;
  if v_entry.status <> 'draft' then
    raise exception 'Only draft entries can be posted (this one is %)', v_entry.status using errcode = '22023';
  end if;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*)
    into v_debits, v_credits, v_lines
    from public.journal_lines where entry_id = p_entry_id;

  if v_lines < 2 then
    raise exception 'An entry needs at least two lines' using errcode = '22023';
  end if;
  if v_debits <> v_credits then
    raise exception 'Entry is not balanced: debits % ≠ credits %', v_debits, v_credits using errcode = '22023';
  end if;
  if v_debits = 0 then
    raise exception 'An entry cannot be zero' using errcode = '22023';
  end if;

  select string_agg(a.code, ', ') into v_inactive
    from public.journal_lines l join public.accounts a on a.id = l.account_id
   where l.entry_id = p_entry_id and not a.is_active;
  if v_inactive is not null then
    raise exception 'Archived accounts cannot receive entries: %', v_inactive using errcode = '22023';
  end if;

  perform public.assert_date_open(v_entry.entry_date);

  -- Row lock serialises postings, so numbers follow posting order with no gaps
  update public.journal_numbering set last_number = last_number + 1 where id returning last_number into v_number;
  update public.journal_entries
     set status = 'posted', entry_number = v_number, posted_at = now(), posted_by = auth.uid()
   where id = p_entry_id;

  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, new_data, reason, source)
  values (auth.uid(), auth.role(), 'POST', 'journal_entries', p_entry_id::text,
          jsonb_build_object('entry_number', v_number, 'total', v_debits, 'date', v_entry.entry_date,
                             'source', v_entry.source, 'description', v_entry.description),
          nullif(current_setting('app.reason', true), ''),
          case when coalesce(auth.role(), '') = 'service_role' then 'system' else 'user' end);
  return v_number;
end;
$$;

/*
  create_journal_entry — the ONLY way entries are written.
  p_entry: { entry_date, description, memo?, source?, source_ref?, idempotency_key? }
  p_lines: [{ account_id | account_code | system_key, debit | credit, description?, order_id?,
              product_id?, sku?, customer_id?, stripe_object_id?, reference? }, …]
  p_post:  true → validate and post atomically; false → save as draft.
  Idempotent: an existing idempotency_key returns the existing entry id and writes nothing.
*/
create or replace function public.create_journal_entry(p_entry jsonb, p_lines jsonb, p_post boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_key text := nullif(trim(p_entry ->> 'idempotency_key'), '');
  v_source text := coalesce(nullif(p_entry ->> 'source', ''), 'manual');
  v_line jsonb;
  v_account uuid;
  v_n int := 0;
  v_debit numeric(14,2);
  v_credit numeric(14,2);
  v_is_system boolean := coalesce(auth.role(), '') = 'service_role';
begin
  perform public.require_permission('journal.create');
  if p_post then
    perform public.require_permission('journal.post');
  end if;
  -- Only the server may create automatic entries; people create manual ones
  if not v_is_system and v_source not in ('manual', 'opening_balance', 'equity', 'transfer') then
    raise exception 'Source % is reserved for automatic entries', v_source using errcode = '42501';
  end if;

  if v_key is not null then
    select id into v_id from public.journal_entries where idempotency_key = v_key;
    if found then
      return v_id;
    end if;
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'An entry needs at least two lines' using errcode = '22023';
  end if;

  perform set_config('app.reason', coalesce(p_entry ->> 'reason', ''), true);

  insert into public.journal_entries (entry_date, description, memo, source, source_ref, idempotency_key,
                                      created_origin, created_by)
  values ((p_entry ->> 'entry_date')::date,
          p_entry ->> 'description',
          nullif(p_entry ->> 'memo', ''),
          v_source,
          nullif(p_entry ->> 'source_ref', ''),
          v_key,
          case when v_is_system then 'system' else 'user' end,
          auth.uid())
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  -- Lost a race with a concurrent call using the same key → return the winner
  if v_id is null then
    select id into v_id from public.journal_entries where idempotency_key = v_key;
    return v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    v_account := null;
    if v_line ? 'account_id' then
      v_account := (v_line ->> 'account_id')::uuid;
    elsif v_line ? 'account_code' then
      select id into v_account from public.accounts where code = v_line ->> 'account_code';
    elsif v_line ? 'system_key' then
      select id into v_account from public.accounts where system_key = v_line ->> 'system_key';
    end if;
    if v_account is null or not exists (select 1 from public.accounts where id = v_account) then
      raise exception 'Line %: account not found', v_n using errcode = '22023';
    end if;

    v_debit := round(coalesce((v_line ->> 'debit')::numeric, 0), 2);
    v_credit := round(coalesce((v_line ->> 'credit')::numeric, 0), 2);

    insert into public.journal_lines (entry_id, line_no, account_id, debit, credit, description, order_id,
                                      product_id, sku, customer_id, stripe_object_id, reference)
    values (v_id, v_n, v_account, v_debit, v_credit,
            nullif(v_line ->> 'description', ''),
            nullif(v_line ->> 'order_id', '')::uuid,
            nullif(v_line ->> 'product_id', ''),
            nullif(v_line ->> 'sku', ''),
            nullif(v_line ->> 'customer_id', '')::uuid,
            nullif(v_line ->> 'stripe_object_id', ''),
            nullif(v_line ->> 'reference', ''));
  end loop;

  if p_post then
    perform public._post_entry(v_id);
  else
    insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, new_data, source)
    values (auth.uid(), auth.role(), 'CREATE_DRAFT', 'journal_entries', v_id::text,
            jsonb_build_object('description', p_entry ->> 'description', 'date', p_entry ->> 'entry_date'),
            case when v_is_system then 'system' else 'user' end);
  end if;
  return v_id;
end;
$$;

-- Post an existing draft
create or replace function public.post_journal_entry(p_entry_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_permission('journal.post');
  return public._post_entry(p_entry_id);
end;
$$;

-- Replace the lines of a draft (drafts only; posted entries are immutable)
create or replace function public.update_draft_entry(p_entry_id uuid, p_entry jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_line jsonb;
  v_account uuid;
  v_n int := 0;
begin
  perform public.require_permission('journal.create');
  select status into v_status from public.journal_entries where id = p_entry_id for update;
  if v_status is distinct from 'draft' then
    raise exception 'Only drafts can be edited' using errcode = '42501';
  end if;
  update public.journal_entries
     set entry_date = coalesce((p_entry ->> 'entry_date')::date, entry_date),
         description = coalesce(nullif(p_entry ->> 'description', ''), description),
         memo = p_entry ->> 'memo'
   where id = p_entry_id;
  delete from public.journal_lines where entry_id = p_entry_id;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    v_account := coalesce((v_line ->> 'account_id')::uuid,
                          (select id from public.accounts where code = v_line ->> 'account_code'));
    if v_account is null then
      raise exception 'Line %: account not found', v_n using errcode = '22023';
    end if;
    insert into public.journal_lines (entry_id, line_no, account_id, debit, credit, description, reference)
    values (p_entry_id, v_n, v_account,
            round(coalesce((v_line ->> 'debit')::numeric, 0), 2),
            round(coalesce((v_line ->> 'credit')::numeric, 0), 2),
            nullif(v_line ->> 'description', ''), nullif(v_line ->> 'reference', ''));
  end loop;
  return p_entry_id;
end;
$$;

-- Void a draft (kept for the record, never deleted silently)
create or replace function public.void_draft_entry(p_entry_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_permission('journal.create');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  perform set_config('app.reason', p_reason, true);
  update public.journal_entries set status = 'void' where id = p_entry_id and status = 'draft';
  if not found then
    raise exception 'Only drafts can be voided; posted entries must be reversed' using errcode = '42501';
  end if;
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, reason, source)
  values (auth.uid(), auth.role(), 'VOID', 'journal_entries', p_entry_id::text, p_reason, 'user');
end;
$$;

-- Reverse a posted entry: a new posted entry with debits and credits swapped
create or replace function public.reverse_journal_entry(p_entry_id uuid, p_date date, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.journal_entries;
  v_new uuid;
begin
  perform public.require_permission('journal.post');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to reverse an entry' using errcode = '22023';
  end if;

  select * into v_entry from public.journal_entries where id = p_entry_id for update;
  if not found or v_entry.status <> 'posted' then
    raise exception 'Only posted entries can be reversed' using errcode = '22023';
  end if;
  if v_entry.reversed_by is not null then
    raise exception 'Entry % was already reversed', v_entry.entry_number using errcode = '22023';
  end if;
  if v_entry.reversal_of is not null then
    raise exception 'A reversal cannot itself be reversed; create a new entry instead' using errcode = '22023';
  end if;

  perform set_config('app.reason', p_reason, true);

  insert into public.journal_entries (entry_date, description, memo, source, source_ref, idempotency_key,
                                      reversal_of, created_origin, created_by)
  values (coalesce(p_date, current_date),
          'Reversal of #' || v_entry.entry_number || ' — ' || v_entry.description,
          p_reason, 'reversal', v_entry.source_ref, 'reversal:' || v_entry.id,
          p_entry_id,
          case when coalesce(auth.role(), '') = 'service_role' then 'system' else 'user' end,
          auth.uid())
  returning id into v_new;

  insert into public.journal_lines (entry_id, line_no, account_id, debit, credit, description, order_id,
                                    product_id, sku, customer_id, stripe_object_id, reference)
  select v_new, line_no, account_id, credit, debit, description, order_id,
         product_id, sku, customer_id, stripe_object_id, reference
    from public.journal_lines where entry_id = p_entry_id;

  perform public._post_entry(v_new);
  update public.journal_entries set reversed_by = v_new where id = p_entry_id;

  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, new_data, reason, source)
  values (auth.uid(), auth.role(), 'REVERSE', 'journal_entries', p_entry_id::text,
          jsonb_build_object('reversal_entry', v_new), p_reason, 'user');
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 8. Periods: close / reopen
-- ---------------------------------------------------------------------------------------------

create or replace function public.close_period(p_period_start date, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_period_start)::date;
  v_drafts int;
begin
  perform public.require_permission('periods.close');
  select count(*) into v_drafts from public.journal_entries
   where status = 'draft' and date_trunc('month', entry_date)::date = v_start;
  if v_drafts > 0 then
    raise exception '% draft entr% in %: post or void them before closing', v_drafts,
      case when v_drafts = 1 then 'y' else 'ies' end, to_char(v_start, 'YYYY-MM') using errcode = '22023';
  end if;
  insert into public.accounting_periods (period_start) values (v_start) on conflict (period_start) do nothing;
  perform set_config('app.reason', coalesce(p_notes, ''), true);
  update public.accounting_periods
     set status = 'closed', closed_at = now(), closed_by = auth.uid(), notes = coalesce(p_notes, notes)
   where period_start = v_start and status = 'open';
end;
$$;

create or replace function public.reopen_period(p_period_start date, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_period_start)::date;
begin
  perform public.require_permission('periods.reopen');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to reopen a period' using errcode = '22023';
  end if;
  perform set_config('app.reason', p_reason, true);
  update public.accounting_periods
     set status = 'open', reopened_at = now(), reopened_by = auth.uid()
   where period_start = v_start and status = 'closed';
  if not found then
    raise exception 'Period % is not closed', to_char(v_start, 'YYYY-MM') using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 9. Read models: balances, trial balance, general ledger
-- ---------------------------------------------------------------------------------------------

-- Signed amount in the account's normal direction (positive = normal balance)
create or replace function public.signed_amount(p_normal text, p_debit numeric, p_credit numeric)
returns numeric language sql immutable as $$
  select case when p_normal = 'debit' then p_debit - p_credit else p_credit - p_debit end;
$$;

create or replace function public.trial_balance(p_from date, p_to date)
returns table (
  account_id uuid, code text, name text, type text, subtype text, normal_balance text,
  opening numeric, debits numeric, credits numeric, closing numeric
)
language sql
stable
security definer
set search_path = public
as $$
  -- Every account appears (zero if unused); only POSTED lines count
  select a.id, a.code, a.name, a.type, a.subtype, a.normal_balance,
         coalesce(t.opening, 0), coalesce(t.debits, 0), coalesce(t.credits, 0), coalesce(t.closing, 0)
    from public.accounts a
    left join (
      select l.account_id,
             sum(public.signed_amount(a2.normal_balance, l.debit, l.credit)) filter (where e.entry_date < p_from) as opening,
             sum(l.debit)  filter (where e.entry_date between p_from and p_to) as debits,
             sum(l.credit) filter (where e.entry_date between p_from and p_to) as credits,
             sum(public.signed_amount(a2.normal_balance, l.debit, l.credit)) filter (where e.entry_date <= p_to) as closing
        from public.journal_lines l
        join public.journal_entries e on e.id = l.entry_id and e.status = 'posted'
        join public.accounts a2 on a2.id = l.account_id
       group by l.account_id
    ) t on t.account_id = a.id
   where public.has_permission('accounting.view')
   order by a.code;
$$;

create or replace function public.general_ledger(p_account_id uuid, p_from date, p_to date)
returns table (
  line_id uuid, entry_id uuid, entry_number bigint, entry_date date, source text, source_ref text,
  entry_description text, line_description text, debit numeric, credit numeric,
  running_balance numeric, order_id uuid, product_id text, sku text, stripe_object_id text, reference text
)
language sql
stable
security definer
set search_path = public
as $$
  with acct as (
    select id, normal_balance from public.accounts where id = p_account_id
  ), opening as (
    select coalesce(sum(public.signed_amount(acct.normal_balance, l.debit, l.credit)), 0) as bal
      from acct
      join public.journal_lines l on l.account_id = acct.id
      join public.journal_entries e on e.id = l.entry_id and e.status = 'posted'
     where e.entry_date < p_from
  )
  select l.id, e.id, e.entry_number, e.entry_date, e.source, e.source_ref,
         e.description, l.description, l.debit, l.credit,
         (select bal from opening) + sum(public.signed_amount(acct.normal_balance, l.debit, l.credit))
           over (order by e.entry_date, e.entry_number, l.line_no rows between unbounded preceding and current row),
         l.order_id, l.product_id, l.sku, l.stripe_object_id, l.reference
    from acct
    join public.journal_lines l on l.account_id = acct.id
    join public.journal_entries e on e.id = l.entry_id and e.status = 'posted'
   where public.has_permission('accounting.view')
     and e.entry_date between p_from and p_to
   order by e.entry_date, e.entry_number, l.line_no;
$$;

create or replace function public.account_opening_balance(p_account_id uuid, p_from date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(public.signed_amount(a.normal_balance, l.debit, l.credit)), 0)
    from public.accounts a
    join public.journal_lines l on l.account_id = a.id
    join public.journal_entries e on e.id = l.entry_id and e.status = 'posted'
   where a.id = p_account_id and e.entry_date < p_from and public.has_permission('accounting.view');
$$;

-- ---------------------------------------------------------------------------------------------
-- 10. Row Level Security
-- ---------------------------------------------------------------------------------------------

alter table public.permissions         enable row level security;
alter table public.roles               enable row level security;
alter table public.role_permissions    enable row level security;
alter table public.admin_roles         enable row level security;
alter table public.audit_log           enable row level security;
alter table public.accounting_settings enable row level security;
alter table public.accounts            enable row level security;
alter table public.accounting_periods  enable row level security;
alter table public.journal_entries     enable row level security;
alter table public.journal_lines       enable row level security;
alter table public.journal_numbering   enable row level security;

drop policy if exists "admins read permissions" on public.permissions;
create policy "admins read permissions" on public.permissions for select to authenticated using (public.is_admin());
drop policy if exists "admins read roles" on public.roles;
create policy "admins read roles" on public.roles for select to authenticated using (public.is_admin());
drop policy if exists "admins read role permissions" on public.role_permissions;
create policy "admins read role permissions" on public.role_permissions for select to authenticated using (public.is_admin());

drop policy if exists "read admin roles" on public.admin_roles;
create policy "read admin roles" on public.admin_roles for select to authenticated
  using (user_id = auth.uid() or public.has_permission('users.manage'));
drop policy if exists "manage admin roles" on public.admin_roles;
create policy "manage admin roles" on public.admin_roles for all to authenticated
  using (public.has_permission('users.manage')) with check (public.has_permission('users.manage'));

drop policy if exists "view audit log" on public.audit_log;
create policy "view audit log" on public.audit_log for select to authenticated using (public.has_permission('audit.view'));

drop policy if exists "view settings" on public.accounting_settings;
create policy "view settings" on public.accounting_settings for select to authenticated using (public.has_permission('accounting.view'));
drop policy if exists "manage settings" on public.accounting_settings;
create policy "manage settings" on public.accounting_settings for update to authenticated
  using (public.has_permission('accounting.settings')) with check (public.has_permission('accounting.settings'));

drop policy if exists "view accounts" on public.accounts;
create policy "view accounts" on public.accounts for select to authenticated using (public.has_permission('accounting.view'));
drop policy if exists "create accounts" on public.accounts;
create policy "create accounts" on public.accounts for insert to authenticated
  with check (public.has_permission('accounts.manage') and system_key is null);
drop policy if exists "update accounts" on public.accounts;
create policy "update accounts" on public.accounts for update to authenticated
  using (public.has_permission('accounts.manage')) with check (public.has_permission('accounts.manage'));
-- No delete policy: accounts are archived (is_active = false), never deleted

drop policy if exists "view periods" on public.accounting_periods;
create policy "view periods" on public.accounting_periods for select to authenticated using (public.has_permission('accounting.view'));

-- Journal: read-only through the API; every write goes through the security-definer functions above
drop policy if exists "view journal entries" on public.journal_entries;
create policy "view journal entries" on public.journal_entries for select to authenticated using (public.has_permission('accounting.view'));
drop policy if exists "view journal lines" on public.journal_lines;
create policy "view journal lines" on public.journal_lines for select to authenticated using (public.has_permission('accounting.view'));

-- ---------------------------------------------------------------------------------------------
-- 11. Row-level audit on configuration tables
-- ---------------------------------------------------------------------------------------------

drop trigger if exists audit_accounts on public.accounts;
create trigger audit_accounts after insert or update on public.accounts
  for each row execute function public.audit_row();
drop trigger if exists audit_settings on public.accounting_settings;
create trigger audit_settings after update on public.accounting_settings
  for each row execute function public.audit_row();
drop trigger if exists audit_periods on public.accounting_periods;
create trigger audit_periods after update on public.accounting_periods
  for each row execute function public.audit_row();
drop trigger if exists audit_admin_roles on public.admin_roles;
create trigger audit_admin_roles after insert or update or delete on public.admin_roles
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------------------------
-- 12. Function privileges: nothing callable anonymously
-- ---------------------------------------------------------------------------------------------

do $$
declare f text;
begin
  foreach f in array array[
    'public.create_journal_entry(jsonb, jsonb, boolean)',
    'public.post_journal_entry(uuid)',
    'public.update_draft_entry(uuid, jsonb, jsonb)',
    'public.void_draft_entry(uuid, text)',
    'public.reverse_journal_entry(uuid, date, text)',
    'public.close_period(date, text)',
    'public.reopen_period(date, text)',
    'public.trial_balance(date, date)',
    'public.general_ledger(uuid, date, date)',
    'public.account_opening_balance(uuid, date)',
    'public.my_permissions()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public._post_entry(uuid)',
    'public.assert_date_open(date)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
