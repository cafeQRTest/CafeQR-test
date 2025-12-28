-- =========================================
-- 0) SAFETY: run in a transaction
-- =========================================
begin;

-- =========================================
-- 1) customers: allow email-only users (phone optional)
--    - Make phone nullable
--    - Replace UNIQUE(phone) constraint with a partial unique index
--      so multiple NULL phones are allowed, but real phones stay unique.
-- =========================================

alter table public.customers
  alter column phone drop not null;

-- Drop the existing unique constraint on phone if it exists (name can vary)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'customers_phone_key'
      and conrelid = 'public.customers'::regclass
  ) then
    execute 'alter table public.customers drop constraint customers_phone_key';
  end if;
end $$;

-- Enforce uniqueness only when phone is present
create unique index if not exists customers_phone_unique_not_null
  on public.customers (phone)
  where phone is not null;

-- Helpful indexes for RLS / joins
create index if not exists customers_user_id_idx on public.customers (user_id);
create index if not exists customer_addresses_customer_id_idx on public.customer_addresses (customer_id);
create index if not exists restaurant_customers_customer_id_idx on public.restaurant_customers (customer_id);
create index if not exists restaurant_customers_restaurant_id_idx on public.restaurant_customers (restaurant_id);
create index if not exists restaurant_staff_restaurant_id_idx on public.restaurant_staff (restaurant_id);
create index if not exists restaurant_staff_staff_email_idx on public.restaurant_staff (staff_email);

-- =========================================
-- 2) Helper: current email from JWT
--    (auth.jwt() returns JWT claims; app_metadata is safer for authZ than user_metadata)
-- =========================================
create schema if not exists private;

create or replace function private.current_email()
returns text
language sql
stable
as $$
  select nullif((select auth.jwt() ->> 'email'), '');
$$;

-- =========================================
-- 3) Enable RLS on relevant tables
-- =========================================
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.restaurant_customers enable row level security;

-- (optional but recommended if you query them directly from client)
alter table public.restaurant_staff enable row level security;
alter table public.orders enable row level security;

-- =========================================
-- 4) customers RLS
--    A) Delivery-app user: can read/insert/update only their own row (customers.user_id = auth.uid()).
--    B) POS staff: can read customers only if linked via restaurant_customers and they belong to that restaurant.
--    C) POS staff: can insert/update ONLY "walk-in" customers (user_id is NULL).
-- =========================================

-- Clean up old policies (optional; safe if you re-run)
drop policy if exists customers_select_own on public.customers;
drop policy if exists customers_insert_own on public.customers;
drop policy if exists customers_update_own on public.customers;
drop policy if exists customers_select_for_staff_restaurants on public.customers;
drop policy if exists customers_insert_walkin_for_staff on public.customers;
drop policy if exists customers_update_walkin_for_staff on public.customers;

-- Delivery user: SELECT own
create policy customers_select_own
on public.customers
for select
to authenticated
using (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
);

-- Delivery user: INSERT own
create policy customers_insert_own
on public.customers
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
);

-- Delivery user: UPDATE own (can't change ownership)
create policy customers_update_own
on public.customers
for update
to authenticated
using (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
)
with check (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
);

-- POS staff: SELECT customers linked to their restaurants
create policy customers_select_for_staff_restaurants
on public.customers
for select
to authenticated
using (
  exists (
    select 1
    from public.restaurant_customers rc
    join public.restaurant_staff rs
      on rs.restaurant_id = rc.restaurant_id
    where rc.customer_id = public.customers.id
      and rs.staff_email = (select private.current_email())
  )
);

-- POS staff: INSERT walk-in customers only (no user_id allowed)
create policy customers_insert_walkin_for_staff
on public.customers
for insert
to authenticated
with check (
  user_id is null
  and exists (
    select 1
    from public.restaurant_staff rs
    where rs.staff_email = (select private.current_email())
  )
);

-- POS staff: UPDATE walk-in customers only (still no user_id allowed)
create policy customers_update_walkin_for_staff
on public.customers
for update
to authenticated
using (
  user_id is null
  and exists (
    select 1
    from public.restaurant_staff rs
    where rs.staff_email = (select private.current_email())
  )
)
with check (
  user_id is null
  and exists (
    select 1
    from public.restaurant_staff rs
    where rs.staff_email = (select private.current_email())
  )
);

-- =========================================
-- 5) customer_addresses RLS (delivery users manage only their own addresses)
-- =========================================

drop policy if exists addresses_select_own on public.customer_addresses;
drop policy if exists addresses_insert_own on public.customer_addresses;
drop policy if exists addresses_update_own on public.customer_addresses;
drop policy if exists addresses_delete_own on public.customer_addresses;

create policy addresses_select_own
on public.customer_addresses
for select
to authenticated
using (
  exists (
    select 1
    from public.customers c
    where c.id = customer_addresses.customer_id
      and c.user_id = (select auth.uid())
  )
);

create policy addresses_insert_own
on public.customer_addresses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.customers c
    where c.id = customer_addresses.customer_id
      and c.user_id = (select auth.uid())
  )
);

create policy addresses_update_own
on public.customer_addresses
for update
to authenticated
using (
  exists (
    select 1
    from public.customers c
    where c.id = customer_addresses.customer_id
      and c.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.customers c
    where c.id = customer_addresses.customer_id
      and c.user_id = (select auth.uid())
  )
);

create policy addresses_delete_own
on public.customer_addresses
for delete
to authenticated
using (
  exists (
    select 1
    from public.customers c
    where c.id = customer_addresses.customer_id
      and c.user_id = (select auth.uid())
  )
);

-- =========================================
-- 6) restaurant_customers RLS
--    Staff can manage rows only for restaurants they belong to.
-- =========================================

drop policy if exists restaurant_customers_select_staff on public.restaurant_customers;
drop policy if exists restaurant_customers_insert_staff on public.restaurant_customers;
drop policy if exists restaurant_customers_update_staff on public.restaurant_customers;

create policy restaurant_customers_select_staff
on public.restaurant_customers
for select
to authenticated
using (
  exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = restaurant_customers.restaurant_id
      and rs.staff_email = (select private.current_email())
  )
);

create policy restaurant_customers_insert_staff
on public.restaurant_customers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = restaurant_customers.restaurant_id
      and rs.staff_email = (select private.current_email())
  )
);

create policy restaurant_customers_update_staff
on public.restaurant_customers
for update
to authenticated
using (
  exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = restaurant_customers.restaurant_id
      and rs.staff_email = (select private.current_email())
  )
)
with check (
  exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = restaurant_customers.restaurant_id
      and rs.staff_email = (select private.current_email())
  )
);

-- =========================================
-- 7) restaurant_staff RLS (optional)
--    Lets staff read their own membership rows (useful for client-side checks).
-- =========================================
drop policy if exists restaurant_staff_select_self on public.restaurant_staff;

create policy restaurant_staff_select_self
on public.restaurant_staff
for select
to authenticated
using (
  staff_email = (select private.current_email())
);

-- =========================================
-- 8) orders RLS (minimal, but important)
--    A) Delivery user can insert/select only their own orders (via customer_id)
--    B) Staff can select orders for their restaurant
-- =========================================

drop policy if exists orders_select_own on public.orders;
drop policy if exists orders_insert_own on public.orders;
drop policy if exists orders_select_staff_restaurant on public.orders;

-- Delivery user: select own orders
create policy orders_select_own
on public.orders
for select
to authenticated
using (
  exists (
    select 1
    from public.customers c
    where c.id = orders.customer_id
      and c.user_id = (select auth.uid())
  )
);

-- Delivery user: insert own orders (must attach their customer_id)
create policy orders_insert_own
on public.orders
for insert
to authenticated
with check (
  exists (
    select 1
    from public.customers c
    where c.id = orders.customer_id
      and c.user_id = (select auth.uid())
  )
);

-- Staff: select restaurant orders
create policy orders_select_staff_restaurant
on public.orders
for select
to authenticated
using (
  exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = orders.restaurant_id
      and rs.staff_email = (select private.current_email())
  )
);

-- =========================================
-- 9) Auto-link customer to restaurant when an order is created
--    This ensures delivery customers show up in the restaurant Customers page automatically.
--    Keep security definer function in private schema (not exposed).
-- =========================================

create or replace function private.link_customer_to_restaurant_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.restaurant_id is null or new.customer_id is null then
    return new;
  end if;

  insert into public.restaurant_customers (restaurant_id, customer_id, first_order_at, last_order_at, order_count, total_spent)
  values (new.restaurant_id, new.customer_id, now(), now(), 1, coalesce(new.total, 0))
  on conflict (restaurant_id, customer_id)
  do update set
    last_order_at = excluded.last_order_at,
    order_count = public.restaurant_customers.order_count + 1,
    total_spent = public.restaurant_customers.total_spent + excluded.total_spent,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_link_customer_to_restaurant_from_order on public.orders;

create trigger trg_link_customer_to_restaurant_from_order
after insert on public.orders
for each row
execute function private.link_customer_to_restaurant_from_order();

commit;
