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
  -- 1. Eligibility Check (UNCHANGED)
  IF NOT (
      new.status = 'completed' 
      AND new.payment_status IN ('paid', 'completed') 
      AND COALESCE(new.is_credit, false) = false
  ) THEN
      RETURN new;
  END IF;

  -- 2. Idempotency (UNCHANGED)
  IF (TG_OP = 'UPDATE') THEN
      IF (
          old.status = 'completed' 
          AND old.payment_status IN ('paid', 'completed')
          AND COALESCE(old.is_credit, false) = false
      ) THEN
         RETURN new;
      END IF;
  END IF;

  IF new.customer_id IS NULL THEN
    RETURN new;
  END IF;

  -- 3. Fetch Settings with Robust Fallback
  -- We use COALESCE to ensure no NULLs leak into the calculation
  SELECT 
    COALESCE(enabled, false) as enabled,
    COALESCE(min_order_value, 0) as min_order_value,
    COALESCE(points_per_rupee, 0) as points_per_rupee
  INTO s
  FROM public.restaurant_loyalty_settings
  WHERE restaurant_id = new.restaurant_id;

  -- If no settings exist at all, exit safely
  IF s IS NULL OR s.enabled IS NOT TRUE THEN
    RETURN new;
  END IF;

  -- 4. Calculate Points safely
  v_total := COALESCE(new.total_inc_tax, new.total_amount, new.total, 0);
  
  -- Exit if order value is too low
  IF v_total < s.min_order_value THEN
    RETURN new;
  END IF;

  -- Calculate points and ensure result is at least 0 (never NULL)
  v_points := floor(v_total * s.points_per_rupee);
  
  -- Violates NOT NULL constraint if we don't check for 0 or negative
  IF v_points IS NULL OR v_points <= 0 THEN
    RETURN new;
  END IF;

  -- 5. Award Points (USING THE PREVIOUS ON CONFLICT FIX)
  INSERT INTO public.loyalty_transactions (
    restaurant_id, 
    customer_id, 
    order_id, 
    txn_type, 
    points_delta, 
    note
  )
  VALUES (
    new.restaurant_id, 
    new.customer_id, 
    new.id, 
    'earn', 
    v_points, 
    'Order completed'
  )
  ON CONFLICT (restaurant_id, order_id, txn_type) DO NOTHING;

  -- 6. Update Customer Stats (UNCHANGED)
  UPDATE public.restaurant_customers rc
  SET 
    loyalty_points = (SELECT COALESCE(SUM(points_delta), 0) FROM public.loyalty_transactions WHERE customer_id = rc.customer_id AND restaurant_id = rc.restaurant_id),
    total_points_earned = (SELECT COALESCE(SUM(points_earned), 0) + COALESCE(SUM(points_delta) FILTER (WHERE points_delta > 0), 0) FROM public.loyalty_transactions WHERE customer_id = rc.customer_id AND restaurant_id = rc.restaurant_id),
    updated_at = NOW()
  WHERE restaurant_id = new.restaurant_id AND customer_id = new.customer_id;

  RETURN new;
END $function$;
