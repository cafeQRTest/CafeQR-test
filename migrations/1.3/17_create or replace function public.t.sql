create or replace function public.trg_orders_sync_customer_stats()
returns trigger
language plpgsql
security definer
as $$
declare
  v_phone text;
  v_name  text;
  v_customer_id uuid;
  v_order_ts timestamptz;
  v_order_date date;
  v_total numeric;
  v_name_match_count int;
begin
  v_phone := public.normalize_phone(new.customer_phone);
  v_name  := nullif(trim(new.customer_name), '');
  v_order_ts := coalesce(new.date_ordered, new.created_at);
  v_order_date := v_order_ts::date;
  v_total := coalesce(new.total_inc_tax, new.total_amount, new.total, 0);

  -- 1) Find / create customer_id
  if v_phone is not null then
    select id into v_customer_id
    from public.customers
    where phone = v_phone
    limit 1;

    if v_customer_id is null then
      -- optional: unique name match within this restaurant
      if v_name is not null then
        select count(*)
          into v_name_match_count
        from public.restaurant_customers rc
        join public.customers c on c.id = rc.customer_id
        where rc.restaurant_id = new.restaurant_id
          and lower(trim(c.name)) = lower(trim(v_name));

        if v_name_match_count = 1 then
          select c.id into v_customer_id
          from public.restaurant_customers rc
          join public.customers c on c.id = rc.customer_id
          where rc.restaurant_id = new.restaurant_id
            and lower(trim(c.name)) = lower(trim(v_name))
          limit 1;

          update public.customers
            set phone = v_phone, updated_at = now()
          where id = v_customer_id and (phone is null or phone = '');
        end if;
      end if;

      if v_customer_id is null then
        insert into public.customers (phone, name)
        values (v_phone, v_name)
        returning id into v_customer_id;
      end if;
    else
      if v_name is not null then
        update public.customers
          set name = coalesce(nullif(name, ''), v_name),
              updated_at = now()
        where id = v_customer_id;
      end if;
    end if;

  elsif v_name is not null then
    select count(*)
      into v_name_match_count
    from public.restaurant_customers rc
    join public.customers c on c.id = rc.customer_id
    where rc.restaurant_id = new.restaurant_id
      and lower(trim(c.name)) = lower(trim(v_name));

    if v_name_match_count = 1 then
      select c.id into v_customer_id
      from public.restaurant_customers rc
      join public.customers c on c.id = rc.customer_id
      where rc.restaurant_id = new.restaurant_id
        and lower(trim(c.name)) = lower(trim(v_name))
      limit 1;
    else
      insert into public.customers (name)
      values (v_name)
      returning id into v_customer_id;
    end if;
  else
    return new;
  end if;

  -- 2) Save customer_id into order (only if missing)
  if new.customer_id is null then
    update public.orders
      set customer_id = v_customer_id,
          customer_phone = coalesce(new.customer_phone, v_phone),
          customer_name  = coalesce(new.customer_name, v_name),
          updated_at = now()
    where id = new.id;
  end if;

  -- 3) Upsert restaurant_customers + visits (FIXED)
  insert into public.restaurant_customers (
    restaurant_id, customer_id,
    first_order_at, last_order_at,
    order_count, total_spent,
    visit_count, last_visit_date,
    updated_at
  ) values (
    new.restaurant_id, v_customer_id,
    v_order_ts, v_order_ts,
    1, v_total,
    1, v_order_date,
    now()
  )
  on conflict (restaurant_id, customer_id) do update
  set
    first_order_at = least(restaurant_customers.first_order_at, excluded.first_order_at),
    last_order_at  = greatest(restaurant_customers.last_order_at, excluded.last_order_at),
    order_count = restaurant_customers.order_count + 1,
    total_spent = restaurant_customers.total_spent + excluded.total_spent,

    visit_count = restaurant_customers.visit_count
      + case
          when restaurant_customers.last_visit_date is null then 1
          when excluded.last_visit_date > restaurant_customers.last_visit_date then 1
          else 0
        end,

    last_visit_date = greatest(
      coalesce(restaurant_customers.last_visit_date, excluded.last_visit_date),
      excluded.last_visit_date
    ),

    updated_at = now();

  return new;
end $$;
