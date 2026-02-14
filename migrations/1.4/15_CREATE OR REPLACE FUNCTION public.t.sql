CREATE OR REPLACE FUNCTION public.trg_orders_award_loyalty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  s record;
  v_total numeric;
  v_points int;
BEGIN
  -- eligibility checks (unchanged) ...
  -- [keep all your existing logic here exactly as-is]

  -- Award points strictly
  INSERT INTO public.loyalty_transactions (
    restaurant_id, customer_id, order_id, txn_type, points_delta, note
  )
  VALUES (
    new.restaurant_id, new.customer_id, new.id,
    'earn', v_points, 'Order completed'
  )
  ON CONFLICT (restaurant_id, order_id, txn_type) DO NOTHING;

  -- Update restaurant_customers (unchanged) ...
  -- [keep the rest of your existing code exactly as-is]

  RETURN new;
END
$function$;
