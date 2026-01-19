create or replace function public.expire_loyalty_points()
returns void
language plpgsql
security definer
as $$
declare r record;
begin
  for r in
    select
      rc.restaurant_id,
      rc.customer_id,
      rc.loyalty_points,
      s.points_expiry_days,
      rc.last_order_at
    from public.restaurant_customers rc
    join public.restaurant_loyalty_settings s on s.restaurant_id = rc.restaurant_id
    where s.enabled = true
      and s.points_expiry_days is not null
      and rc.loyalty_points > 0
      and rc.last_order_at is not null
      and rc.last_order_at < now() - make_interval(days => s.points_expiry_days)
  loop
    insert into public.loyalty_transactions (restaurant_id, customer_id, txn_type, points_delta, note)
    values (r.restaurant_id, r.customer_id, 'adjust', -r.loyalty_points, 'Points expired');

    update public.restaurant_customers
      set loyalty_points = 0,
          updated_at = now()
    where restaurant_id = r.restaurant_id and customer_id = r.customer_id;
  end loop;
end $$;
