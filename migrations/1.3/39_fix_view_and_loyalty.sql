-- 42_fix_view_and_loyalty.sql
-- 1. Updates the View `v_owner_customers` to calculate Total Spent/Counts dynamically.
--    EXCLUDES Credit Orders. REQUIRES Paid & Completed status.
-- 2. Updates Loyalty Trigger to strictly award points only for Paid & Completed & Non-Credit orders.

-- PART 1: FIX THE VIEW (Display Logic)
CREATE OR REPLACE VIEW public.v_owner_customers AS
SELECT 
    rc.customer_id,
    rc.restaurant_id,
    rc.customer_no,
    rc.is_active,
    COALESCE(rc.name, c.name, 'Guest'::text) AS name,
    COALESCE(rc.phone, c.phone) AS phone,
    COALESCE(rc.email, c.email) AS email,
    rc.address,
    
    -- DYNAMIC CALCULATION: Total Spent
    (
        SELECT COALESCE(SUM(o.total_amount), 0)
        FROM public.orders o
        WHERE o.customer_id = rc.customer_id 
          AND o.restaurant_id = rc.restaurant_id
          AND o.payment_status IN ('paid', 'completed')
          AND COALESCE(o.is_credit, false) = false
          AND o.status NOT IN ('cancelled', 'void')
    ) AS total_spent,

    -- DYNAMIC CALCULATION: Visit Count
    (
        SELECT COUNT(DISTINCT date(o.created_at))::int
        FROM public.orders o
        WHERE o.customer_id = rc.customer_id 
          AND o.restaurant_id = rc.restaurant_id
          AND o.payment_status IN ('paid', 'completed')
          AND COALESCE(o.is_credit, false) = false
          AND o.status NOT IN ('cancelled', 'void')
    ) AS visit_count,

    rc.last_order_at,
    rc.first_order_at,
    rc.loyalty_program_id,
    rc.created_at,

    -- DYNAMIC CALCULATION: Order Count
    ( 
        SELECT (count(*))::integer
        FROM public.orders o
        WHERE o.customer_id = rc.customer_id 
          AND o.restaurant_id = rc.restaurant_id
          AND o.payment_status IN ('paid', 'completed')
          AND COALESCE(o.is_credit, false) = false 
          AND o.status NOT IN ('cancelled', 'void')
    ) AS order_count,

    -- EXISTING: Loyalty Points
    ( 
        SELECT COALESCE(sum(lt.points_delta), (0)::bigint)
        FROM public.loyalty_transactions lt
        WHERE lt.customer_id = rc.customer_id 
          AND lt.restaurant_id = rc.restaurant_id
    ) AS loyalty_points,

    ( 
        SELECT (COALESCE(sum(lt.points_earned), (0)::numeric))::bigint
        FROM public.loyalty_transactions lt
        WHERE lt.customer_id = rc.customer_id 
          AND lt.restaurant_id = rc.restaurant_id
    ) AS total_points_earned,

    ( 
        SELECT (COALESCE(sum(lt.points_redeemed), (0)::numeric))::bigint
        FROM public.loyalty_transactions lt
        WHERE lt.customer_id = rc.customer_id 
          AND lt.restaurant_id = rc.restaurant_id
    ) AS total_points_redeemed

FROM public.restaurant_customers rc
LEFT JOIN public.customers c ON rc.customer_id = c.id;


-- PART 2: FIX THE LOYALTY TRIGGER (Awarding Logic)
DROP TRIGGER IF EXISTS orders_award_loyalty ON public.orders;

CREATE OR REPLACE FUNCTION public.trg_orders_award_loyalty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  s record;
  v_total numeric;
  v_points int;
BEGIN
  -- CHECK: Only run if status='completed' AND payment='paid'/'completed' AND NOT Credit
  IF NOT (
      new.status = 'completed' 
      AND new.payment_status IN ('paid', 'completed') 
      AND COALESCE(new.is_credit, false) = false
  ) THEN
      RETURN new;
  END IF;

  -- Ensure we only run this once when the condition is MET (checking old state)
  -- If it was already eligible, we don't re-award.
  -- Eligible Condition: Completed + Paid + NotCredit
  -- Trigger fired because Status OR PaymentStatus changed.
  -- We proceed if:
  --   (Current is Eligible) AND (Old was NOT Eligible or didn't exist)
  IF (TG_OP = 'UPDATE') THEN
      IF (
          old.status = 'completed' 
          AND old.payment_status IN ('paid', 'completed')
          AND COALESCE(old.is_credit, false) = false
      ) THEN
         -- Already was eligible. Do nothing.
         RETURN new;
      END IF;
  END IF;


  IF new.customer_id IS NULL THEN
    RETURN new;
  END IF;

  SELECT * INTO s
  FROM public.restaurant_loyalty_settings
  WHERE restaurant_id = new.restaurant_id;

  IF s IS NULL OR s.enabled IS NOT TRUE THEN
    RETURN new;
  END IF;

  v_total := COALESCE(new.total_inc_tax, new.total_amount, new.total, 0);
  IF v_total < s.min_order_value THEN
    RETURN new;
  END IF;

  v_points := floor(v_total * s.points_per_rupee);
  IF v_points <= 0 THEN
    RETURN new;
  END IF;

  -- Award points strictly
  INSERT INTO public.loyalty_transactions (restaurant_id, customer_id, order_id, txn_type, points_delta, note)
  VALUES (new.restaurant_id, new.customer_id, new.id, 'earn', v_points, 'Order completed')
  ON CONFLICT (order_id, txn_type) DO NOTHING;

  -- Update columns in table (Legacy compatibility)
  UPDATE public.restaurant_customers rc
  SET 
    loyalty_points = (SELECT COALESCE(SUM(points_delta), 0) FROM public.loyalty_transactions WHERE customer_id = rc.customer_id AND restaurant_id = rc.restaurant_id),
    total_points_earned = (SELECT COALESCE(SUM(points_earned), 0) + COALESCE(SUM(points_delta) FILTER (WHERE points_delta > 0), 0) FROM public.loyalty_transactions WHERE customer_id = rc.customer_id AND restaurant_id = rc.restaurant_id),
    updated_at = NOW()
  WHERE restaurant_id = new.restaurant_id AND customer_id = new.customer_id;

  RETURN new;
END $$;

-- Re-create Trigger monitoring Status AND Payment Status
CREATE TRIGGER orders_award_loyalty
AFTER UPDATE OF status, payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_award_loyalty();
