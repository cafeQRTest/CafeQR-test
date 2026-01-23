create table if not exists public.restaurant_loyalty_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  enabled boolean not null default false,

  -- Earn rules
  points_per_rupee numeric not null default 0.01,      -- 1 point per ₹100
  min_order_value numeric not null default 0,

  -- Redeem rules
  redeem_threshold int not null default 100,           -- min points to redeem
  redeem_discount_type text not null default 'percent' check (redeem_discount_type in ('percent','amount')),
  redeem_discount_value numeric not null default 10,   -- 10% or ₹10 depending on type
  max_discount numeric not null default 100,           -- cap to prevent abuse

  -- Expiry rules (simple + common)
  points_expiry_days int,                              -- null = no expiry

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
