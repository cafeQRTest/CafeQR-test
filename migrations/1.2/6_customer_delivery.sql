-- 0) Extensions (if not already enabled)
create extension if not exists "pgcrypto";

-- 1) Global customers (one row per phone)
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Addresses (many per customer)
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text,
  line1 text not null,
  line2 text,
  city text,
  state text,
  pincode text,
  landmark text,
  geo jsonb, -- { lat, lng } optional
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_addresses_customer_id
  on public.customer_addresses(customer_id);

-- 3) Restaurant-scoped CRM/loyalty stats
create table if not exists public.restaurant_customers (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  first_order_at timestamptz,
  last_order_at timestamptz,
  order_count integer not null default 0,
  total_spent numeric not null default 0,
  notes text,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, customer_id)
);

create index if not exists idx_restaurant_customers_restaurant_id
  on public.restaurant_customers(restaurant_id);

-- 4) Orders: add delivery fields (keep existing snapshot fields too)
alter table public.orders
  add column if not exists customer_id uuid references public.customers(id),
  add column if not exists delivery_address_id uuid references public.customer_addresses(id),
  add column if not exists delivery_instructions text,
  add column if not exists delivery_status text default 'new'
    check (delivery_status in ('new','accepted','out_for_delivery','delivered','cancelled_by_restaurant','cancelled_by_customer'));

-- Expand order_type enum-like check to include 'delivery'
-- (Your current CHECK allows 'counter','parcel','dine-in'. Replace it safely.)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'orders_order_type_check'
  ) then
    alter table public.orders drop constraint orders_order_type_check;
  end if;
exception when others then
  -- ignore if constraint name differs
end $$;

alter table public.orders
  add constraint orders_order_type_check
  check (order_type in ('counter','parcel','dine-in','delivery'));

-- Helpful index for delivery ops
create index if not exists idx_orders_restaurant_created_at
  on public.orders(restaurant_id, created_at desc);
