-- Enable RLS
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.restaurant_customers enable row level security;

-- Helper: staff membership check
create or replace function public.is_restaurant_staff(rid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = rid
      and rs.staff_email = (auth.jwt() ->> 'email')
  );
$$;

-- restaurant_customers: staff can read/update for their restaurant
create policy "restaurant_customers_select_staff"
on public.restaurant_customers
for select
to authenticated
using (public.is_restaurant_staff(restaurant_id));

create policy "restaurant_customers_update_staff"
on public.restaurant_customers
for update
to authenticated
using (public.is_restaurant_staff(restaurant_id))
with check (public.is_restaurant_staff(restaurant_id));

-- customers + addresses: staff can read only customers who belong to their restaurant_customers join
create policy "customers_select_staff"
on public.customers
for select
to authenticated
using (
  exists (
    select 1
    from public.restaurant_customers rc
    where rc.customer_id = customers.id
      and public.is_restaurant_staff(rc.restaurant_id)
  )
);

create policy "addresses_select_staff"
on public.customer_addresses
for select
to authenticated
using (
  exists (
    select 1
    from public.restaurant_customers rc
    where rc.customer_id = customer_addresses.customer_id
      and public.is_restaurant_staff(rc.restaurant_id)
  )
);
