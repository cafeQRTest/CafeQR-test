create table if not exists public.restaurant_loyalty_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  enabled boolean not null default false,
  points_per_rupee numeric not null default 0.01, -- 1 point per ₹100
  min_order_value numeric not null default 0,
  redeem_threshold int not null default 100,
  redeem_discount_type text not null default 'percent' check (redeem_discount_type in ('percent','amount')),
  redeem_discount_value numeric not null default 10,
  max_discount numeric not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  txn_type text not null check (txn_type in ('earn','redeem','adjust')),
  points_delta int not null,
  note text,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_loyalty_order_earn
  on public.loyalty_transactions (restaurant_id, order_id, txn_type)
  where order_id is not null;
