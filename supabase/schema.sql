-- =============================================================================================
-- VICKAR — Supabase schema
-- Run once in Supabase → SQL Editor → New query → paste this whole file → Run.
-- Safe to re-run: every statement is idempotent.
-- =============================================================================================

-- ---------- Tables ----------------------------------------------------------------------------

create table if not exists public.categories (
  id          text primary key,
  label       text not null,
  headline    text[] not null default '{}',
  pitch       text not null default '',
  art         text not null default 'box' check (art in ('bottle','sport','sunglasses','watch','box')),
  spec        text not null default '',
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.products (
  id          text primary key,
  name        text not null,
  category    text not null references public.categories(id) on update cascade on delete restrict,
  price       numeric(10,2) not null check (price >= 0),
  compare_at  numeric(10,2) check (compare_at is null or compare_at >= 0),
  rating      numeric(2,1) not null default 0 check (rating between 0 and 5),
  reviews     int not null default 0 check (reviews >= 0),
  badge       text check (badge in ('New','Bestseller','Limited')),
  blurb       text not null default '',
  specs       text[] not null default '{}',
  swatches    jsonb not null default '[]'::jsonb,
  art         text not null default 'box' check (art in ('bottle','sport','sunglasses','watch','box')),
  image       text,
  image_alt   text,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category);
create index if not exists products_published_idx on public.products (published);

-- Who may use the admin panel. Add yourself after creating your user (see bottom of file).
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- Helper ----------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- Row Level Security ----------------------------------------------------------------

alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.admins     enable row level security;

-- Categories: everyone reads, only admins write
drop policy if exists "categories are public" on public.categories;
create policy "categories are public" on public.categories
  for select using (true);

drop policy if exists "admins manage categories" on public.categories;
create policy "admins manage categories" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Products: everyone reads published ones, admins read and write everything
drop policy if exists "published products are public" on public.products;
create policy "published products are public" on public.products
  for select using (published or public.is_admin());

drop policy if exists "admins manage products" on public.products;
create policy "admins manage products" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admins: a signed-in user can only check their own row
drop policy if exists "users see own admin row" on public.admins;
create policy "users see own admin row" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- ---------- Storage: product photos ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product images are public" on storage.objects;
create policy "product images are public" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "admins upload product images" on storage.objects;
create policy "admins upload product images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "admins update product images" on storage.objects;
create policy "admins update product images" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "admins delete product images" on storage.objects;
create policy "admins delete product images" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());

-- ---------- Shipping & inventory fields on products ---------------------------------------------

alter table public.products add column if not exists weight_kg numeric(8,3) not null default 0.5 check (weight_kg > 0);
alter table public.products add column if not exists length_cm numeric(8,1) not null default 10 check (length_cm > 0);
alter table public.products add column if not exists width_cm  numeric(8,1) not null default 10 check (width_cm > 0);
alter table public.products add column if not exists height_cm numeric(8,1) not null default 10 check (height_cm > 0);
alter table public.products add column if not exists hs_code   text;          -- customs code, e.g. 732393
alter table public.products add column if not exists stock     int check (stock is null or stock >= 0); -- null = unlimited

-- ---------- Orders ---------------------------------------------------------------------------
-- Written only by the server (Vercel functions, service role). Admins read and update them.

create table if not exists public.orders (
  id                    uuid primary key default gen_random_uuid(),
  number                text not null unique,
  status                text not null default 'pending'
                        check (status in ('pending','paid','shipped','delivered','cancelled','refunded')),
  email                 text not null,
  customer_name         text not null,
  phone                 text,
  shipping_address      jsonb not null,
  items                 jsonb not null,          -- [{ productId, name, color, colorName, qty, unitPrice }]
  subtotal              numeric(10,2) not null,
  shipping              numeric(10,2) not null,
  total                 numeric(10,2) not null,
  currency              text not null default 'usd',
  shipping_method       jsonb,                   -- { id, name, provider, minDays, maxDays, courierServiceId }
  stripe_session_id     text unique,
  stripe_payment_intent text,
  easyship_shipment_id  text,
  tracking_number       text,
  tracking_url          text,
  notes                 text,
  paid_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists orders_status_idx  on public.orders (status);
create index if not exists orders_created_idx on public.orders (created_at desc);

alter table public.orders enable row level security;

drop policy if exists "admins read orders" on public.orders;
create policy "admins read orders" on public.orders
  for select to authenticated using (public.is_admin());

drop policy if exists "admins update orders" on public.orders;
create policy "admins update orders" on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Atomically deduct stock when an order is paid (called by the Stripe webhook with the service role)
create or replace function public.decrement_stock(p_id text, p_qty int)
returns void
language sql
security definer
set search_path = public
as $$
  update public.products
     set stock = greatest(stock - p_qty, 0), updated_at = now()
   where id = p_id and stock is not null;
$$;

revoke execute on function public.decrement_stock(text, int) from public, anon, authenticated;

-- ---------- Demo data (optional — delete these rows from the admin whenever you like) ----------

insert into public.categories (id, label, headline, pitch, art, spec, position) values ('bottles', 'Steel bottles', array['Cold for 24 hours.','Hot for 12.']::text[], 'Double-wall stainless steel, vacuum sealed, built to outlast every single-use bottle you''ll never buy.', 'bottle', '750 ML · 18/8 STEEL', 0) on conflict (id) do nothing;
insert into public.categories (id, label, headline, pitch, art, spec, position) values ('sport', 'Sport bottles', array['Built for','the long run.']::text[], 'One-hand squeeze, lock-flow nozzle, and a grip shaped to stay in your hand at kilometre thirty.', 'sport', '650 ML · BPA FREE', 1) on conflict (id) do nothing;
insert into public.categories (id, label, headline, pitch, art, spec, position) values ('sunglasses', 'Sunglasses', array['Light,','filtered.']::text[], 'Polarised lenses with full UV400 protection in frames light enough to forget you''re wearing them.', 'sunglasses', 'UV400 · POLARISED', 2) on conflict (id) do nothing;
insert into public.categories (id, label, headline, pitch, art, spec, position) values ('watches', 'Watches', array['Time,','well kept.']::text[], 'Sapphire crystal, 100 m water resistance and movements you can hear if you listen closely.', 'watch', 'Ø 40 MM · 10 ATM', 3) on conflict (id) do nothing;

insert into public.products (id, name, category, price, compare_at, rating, reviews, badge, blurb, specs, swatches, art, published) values ('arc-750', 'Arc Steel Bottle 750', 'bottles', 39, null, 4.8, 1284, 'Bestseller', 'Our everyday insulated bottle. Keeps drinks cold 24 h and hot 12 h, fits most cup holders.', array['750 ml','18/8 stainless steel','Leak-proof loop cap','Dishwasher-safe lid']::text[], '[{"name":"Graphite","hex":"#3b4047"},{"name":"Ember","hex":"#ff7a45"},{"name":"Glacier","hex":"#b9d6e6"}]'::jsonb, 'bottle', true) on conflict (id) do nothing;
insert into public.products (id, name, category, price, compare_at, rating, reviews, badge, blurb, specs, swatches, art, published) values ('arc-500', 'Arc Mini 500', 'bottles', 32, null, 4.7, 612, 'New', 'The same insulation in a bag-friendly size.', array['500 ml','18/8 stainless steel','Powder-coat grip']::text[], '[{"name":"Sage","hex":"#8fa38a"},{"name":"Bone","hex":"#e6e0d4"},{"name":"Graphite","hex":"#3b4047"}]'::jsonb, 'bottle', true) on conflict (id) do nothing;
insert into public.products (id, name, category, price, compare_at, rating, reviews, badge, blurb, specs, swatches, art, published) values ('stride-650', 'Stride Squeeze 650', 'sport', 24, null, 4.6, 903, null, 'Soft-squeeze bottle with a lock-flow nozzle. Rinse-and-go wide mouth.', array['650 ml','BPA-free','Lock-flow nozzle','Grip waist']::text[], '[{"name":"Volt","hex":"#c6f432"},{"name":"Cobalt","hex":"#2f5bff"},{"name":"Carbon","hex":"#25282c"}]'::jsonb, 'sport', true) on conflict (id) do nothing;
insert into public.products (id, name, category, price, compare_at, rating, reviews, badge, blurb, specs, swatches, art, published) values ('stride-pro', 'Stride Pro Insulated', 'sport', 34, 42, 4.8, 377, 'Limited', 'Double-wall squeeze bottle that keeps water cool for a full training session.', array['600 ml','Insulated double wall','Self-sealing valve']::text[], '[{"name":"Ember","hex":"#ff7a45"},{"name":"Ice","hex":"#cfe8f3"}]'::jsonb, 'sport', true) on conflict (id) do nothing;
insert into public.products (id, name, category, price, compare_at, rating, reviews, badge, blurb, specs, swatches, art, published) values ('solace', 'Solace Round', 'sunglasses', 89, null, 4.7, 541, 'New', 'A soft round frame with polarised lenses for bright, everyday light.', array['Polarised','UV400','Acetate frame','Spring hinges']::text[], '[{"name":"Tortoise","hex":"#7a4a26"},{"name":"Onyx","hex":"#1c1d20"},{"name":"Amber","hex":"#c9853a"}]'::jsonb, 'sunglasses', true) on conflict (id) do nothing;
insert into public.products (id, name, category, price, compare_at, rating, reviews, badge, blurb, specs, swatches, art, published) values ('vector', 'Vector Sport', 'sunglasses', 119, null, 4.9, 288, null, 'Wraparound performance frame, 24 g, with grippy nose pads for running and cycling.', array['Polarised','UV400','24 g TR90 frame','Hydrophobic coating']::text[], '[{"name":"Ice blue","hex":"#6fb6e8"},{"name":"Onyx","hex":"#1c1d20"}]'::jsonb, 'sunglasses', true) on conflict (id) do nothing;
insert into public.products (id, name, category, price, compare_at, rating, reviews, badge, blurb, specs, swatches, art, published) values ('meridian', 'Meridian Automatic', 'watches', 249, null, 4.9, 196, 'Bestseller', 'An automatic 40 mm field watch with a sapphire crystal and 42-hour power reserve.', array['Ø 40 mm','Automatic movement','Sapphire crystal','100 m water resistant']::text[], '[{"name":"Steel","hex":"#aeb4bb"},{"name":"Ember dial","hex":"#ff7a45"},{"name":"Black","hex":"#1c1d20"}]'::jsonb, 'watch', true) on conflict (id) do nothing;
insert into public.products (id, name, category, price, compare_at, rating, reviews, badge, blurb, specs, swatches, art, published) values ('pulse', 'Pulse Field', 'watches', 179, 199, 4.6, 142, null, 'Quartz field watch with lume hands and a quick-release strap.', array['Ø 38 mm','Quartz','Mineral crystal','Quick-release strap']::text[], '[{"name":"Olive","hex":"#6b7250"},{"name":"Sand","hex":"#cbb89a"}]'::jsonb, 'watch', true) on conflict (id) do nothing;

-- Demo shipping data (weights in kg, boxes in cm, HS customs codes) and a limited-stock item
update public.products set weight_kg = 0.45, length_cm = 9,  width_cm = 9, height_cm = 29, hs_code = '732393' where category = 'bottles'    and hs_code is null;
update public.products set weight_kg = 0.15, length_cm = 8,  width_cm = 8, height_cm = 27, hs_code = '392410' where category = 'sport'      and hs_code is null;
update public.products set weight_kg = 0.08, length_cm = 17, width_cm = 7, height_cm = 5,  hs_code = '900410' where category = 'sunglasses' and hs_code is null;
update public.products set weight_kg = 0.15, length_cm = 11, width_cm = 11, height_cm = 8, hs_code = '910211' where category = 'watches'    and hs_code is null;
update public.products set stock = 12 where id = 'stride-pro' and stock is null;

-- ---------- Make yourself an admin ------------------------------------------------------------
-- 1. Supabase → Authentication → Users → "Add user" (email + password, tick "Auto confirm").
-- 2. Replace the email below with yours and run just this statement:
--
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'you@example.com'
-- on conflict do nothing;
