-- Push subscriptions + idempotent notification log for "new_order" events
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.push_subscription_restaurants (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  device_token text not null,
  platform text not null default 'web',
  user_email text null,
  user_id uuid null,
  enabled boolean not null default true,
  last_seen_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscription_restaurants
  add column if not exists user_email text null,
  add column if not exists user_id uuid null,
  add column if not exists enabled boolean not null default true,
  add column if not exists last_seen_at timestamptz null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists push_subscriptions_restaurant_token_uniq
  on public.push_subscription_restaurants (restaurant_id, device_token);

create index if not exists push_subscriptions_restaurant_enabled_idx
  on public.push_subscription_restaurants (restaurant_id, enabled);

create index if not exists push_subscriptions_last_seen_idx
  on public.push_subscription_restaurants (last_seen_at desc);

alter table public.push_subscription_restaurants enable row level security;

drop policy if exists push_subscriptions_service_role_only on public.push_subscription_restaurants;
create policy push_subscriptions_service_role_only
  on public.push_subscription_restaurants
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.push_notifications_log (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid not null,
  kind text not null default 'new_order',
  dedupe_key text not null,
  status text not null default 'queued',
  success_count integer not null default 0,
  failure_count integer not null default 0,
  token_count integer not null default 0,
  payload jsonb null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_notifications_log
  add column if not exists dedupe_key text,
  add column if not exists status text not null default 'queued',
  add column if not exists success_count integer not null default 0,
  add column if not exists failure_count integer not null default 0,
  add column if not exists token_count integer not null default 0,
  add column if not exists payload jsonb null,
  add column if not exists error_message text null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.push_notifications_log
set dedupe_key = coalesce(dedupe_key, concat(kind, ':', order_id::text))
where dedupe_key is null;

alter table public.push_notifications_log
  alter column dedupe_key set not null;

create unique index if not exists push_notifications_restaurant_order_kind_uniq
  on public.push_notifications_log (restaurant_id, order_id, kind);

create unique index if not exists push_notifications_dedupe_key_uniq
  on public.push_notifications_log (dedupe_key);

create index if not exists push_notifications_created_idx
  on public.push_notifications_log (created_at desc);

alter table public.push_notifications_log enable row level security;

drop policy if exists push_notifications_log_service_role_only on public.push_notifications_log;
create policy push_notifications_log_service_role_only
  on public.push_notifications_log
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
