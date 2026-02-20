-- 1) Add columns to orders
alter table public.orders
  add column if not exists taken_by_name text,
  add column if not exists taken_by_user_id uuid,
  add column if not exists taken_by_email text,
  add column if not exists taken_by_role text;

-- 2) Optional but recommended: check constraint (prevents staff orders without a name)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_taken_by_name_required_for_staff'
  ) then
    alter table public.orders
      add constraint orders_taken_by_name_required_for_staff
      check (
        taken_by_role is distinct from 'staff'
        or (taken_by_name is not null and length(btrim(taken_by_name)) >= 2)
      );
  end if;
end $$;

-- 3) Helpful index for reports
create index if not exists idx_orders_taken_by_email on public.orders (taken_by_email);
create index if not exists idx_orders_taken_by_name on public.orders (taken_by_name);
