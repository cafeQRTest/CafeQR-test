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

    -- IMPORTANT: use the *incoming* order date to decide if this is a new visit
    visit_count = restaurant_customers.visit_count
      + case
          when restaurant_customers.last_visit_date is null then 1
          when excluded.last_visit_date > restaurant_customers.last_visit_date then 1
          else 0
        end,

    -- store latest visit date (incoming order date)
    last_visit_date = greatest(
      coalesce(restaurant_customers.last_visit_date, excluded.last_visit_date),
      excluded.last_visit_date
    ),

    updated_at = now();
