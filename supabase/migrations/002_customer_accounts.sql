-- =============================================================================================
-- VICKAR — customer accounts (run once in Supabase → SQL Editor if you already ran schema.sql)
-- Links every order to the customer who placed it; customers can read only their own orders.
-- =============================================================================================

alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists orders_user_idx on public.orders (user_id, created_at desc);

drop policy if exists "customers read own orders" on public.orders;
create policy "customers read own orders" on public.orders
  for select to authenticated using (user_id = auth.uid());
