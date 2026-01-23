create or replace function public.trg_orders_award_loyalty()
returns trigger
language plpgsql
security definer
as $$
declare
  s record;
  v_total numeric;
  v_points int;
begin
  -- award only when status transitions to completed
  if not (old.status is distinct from new.status and new.status = 'completed') then
    return new;
  end if;

  if new.customer_id is null then
    return new; -- no customer, cannot award
  end if;

  select * into s
  from public.restaurant_loyalty_settings
  where restaurant_id = new.restaurant_id;

  if s is null or s.enabled is not true then
    return new;
  end if;

  v_total := coalesce(new.total_inc_tax, new.total_amount, new.total, 0);
  if v_total < s.min_order_value then
    return new;
  end if;

  v_points := floor(v_total * s.points_per_rupee);
  if v_points <= 0 then
    return new;
  end if;

  insert into public.loyalty_transactions (restaurant_id, customer_id, order_id, txn_type, points_delta, note)
  values (new.restaurant_id, new.customer_id, new.id, 'earn', v_points, 'Order completed')
  on conflict do nothing;

  update public.restaurant_customers
    set loyalty_points = loyalty_points + v_points,
        total_points_earned = total_points_earned + v_points,
        updated_at = now()
  where restaurant_id = new.restaurant_id and customer_id = new.customer_id;

  return new;
end $$;

drop trigger if exists orders_award_loyalty on public.orders;

create trigger orders_award_loyalty
after update of status on public.orders
for each row
execute function public.trg_orders_award_loyalty();
