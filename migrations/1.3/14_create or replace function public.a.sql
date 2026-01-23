create or replace function public.adjust_loyalty_points(
  p_restaurant_id uuid,
  p_customer_id uuid,
  p_points_delta int,
  p_note text default null
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.loyalty_transactions (restaurant_id, customer_id, txn_type, points_delta, note)
  values (p_restaurant_id, p_customer_id, 'adjust', p_points_delta, p_note);

  update public.restaurant_customers
    set loyalty_points = loyalty_points + p_points_delta,
        updated_at = now()
  where restaurant_id = p_restaurant_id and customer_id = p_customer_id;
end $$;
