-- 40_fix_customer_stats_and_loyalty_combined.sql
-- Merges fixes for Customer Stats (Total Spent, Visits) and Loyalty Points.
-- Ensures strict "Paid Only" logic for all stats.
-- Safe to run multiple times (Idempotent).

-- 1. SCHEMA MIGRATION: Ensure columns exist
ALTER TABLE public.restaurant_customers
  ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_spent NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_order_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loyalty_points BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_points_earned BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_points_redeemed BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_visit_date DATE;

-- 2. STATS TRIGGER (Total Spent, Visits)
-- Drop Legacy
DROP TRIGGER IF EXISTS orders_sync_customer_stats ON public.orders;
DROP FUNCTION IF EXISTS public.trg_orders_sync_customer_stats();
DROP TRIGGER IF EXISTS trg_update_customer_stats ON public.orders;
DROP TRIGGER IF EXISTS trg_update_customer_stats_v2 ON public.orders;

-- Define New Function
CREATE OR REPLACE FUNCTION public.update_customer_stats_v2()
RETURNS TRIGGER AS $$
DECLARE
  target_cust UUID;
  target_rest UUID;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    target_cust := OLD.customer_id;
    target_rest := OLD.restaurant_id;
  ELSE
    target_cust := NEW.customer_id;
    target_rest := NEW.restaurant_id;
  END IF;

  IF target_cust IS NOT NULL AND target_rest IS NOT NULL THEN
      UPDATE public.restaurant_customers
      SET
        order_count = (
            SELECT COUNT(*)::int
            FROM public.orders
            WHERE customer_id = target_cust
              AND restaurant_id = target_rest
              AND payment_status IN ('paid', 'completed')
              AND status NOT IN ('cancelled', 'void')
        ),
        total_spent = (
            SELECT COALESCE(SUM(total_amount), 0)
            FROM public.orders
            WHERE customer_id = target_cust
              AND restaurant_id = target_rest
              AND payment_status IN ('paid', 'completed')
              AND status NOT IN ('cancelled', 'void')
        ),
        last_order_at = (
            SELECT MAX(created_at)
            FROM public.orders
            WHERE customer_id = target_cust
              AND restaurant_id = target_rest
              AND status NOT IN ('cancelled', 'void')
        ),
        visit_count = (
            SELECT COUNT(DISTINCT date(created_at))::int
            FROM public.orders
            WHERE customer_id = target_cust
              AND restaurant_id = target_rest
              AND payment_status IN ('paid', 'completed')
              AND status NOT IN ('cancelled', 'void')
        ),
        updated_at = NOW()
      WHERE customer_id = target_cust AND restaurant_id = target_rest;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_customer_stats_v2
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_customer_stats_v2();


-- 3. LOYALTY TRIGGER (Points Awarding)
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
  -- Check if order is eligible: Completed AND Paid
  -- Triggering only if status newly becomes eligible
  IF NOT (
      (new.status = 'completed' AND new.payment_status IN ('paid', 'completed'))
      AND 
      (old.status IS DISTINCT FROM 'completed' OR old.payment_status NOT IN ('paid', 'completed'))
  ) THEN
      RETURN new;
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

  INSERT INTO public.loyalty_transactions (restaurant_id, customer_id, order_id, txn_type, points_delta, note)
  VALUES (new.restaurant_id, new.customer_id, new.id, 'earn', v_points, 'Order completed')
  ON CONFLICT (order_id, txn_type) DO NOTHING;

  -- Update Points Balance (Recalculation)
  UPDATE public.restaurant_customers rc
  SET 
    loyalty_points = (
        SELECT COALESCE(SUM(points_delta), 0)
        FROM public.loyalty_transactions lt
        WHERE lt.customer_id = rc.customer_id AND lt.restaurant_id = rc.restaurant_id
    ),
    total_points_earned = (
        SELECT COALESCE(SUM(points_earned), 0) + COALESCE(SUM(points_delta) FILTER (WHERE txn_type='earn' AND points_earned IS NULL), 0)
        FROM public.loyalty_transactions lt
        WHERE lt.customer_id = rc.customer_id AND lt.restaurant_id = rc.restaurant_id
    ),
    updated_at = NOW()
  WHERE restaurant_id = new.restaurant_id AND customer_id = new.customer_id;

  RETURN new;
END $$;

CREATE TRIGGER orders_award_loyalty
AFTER UPDATE OF status, payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_award_loyalty();


-- 4. RETROACTIVE FIX (Recalculate Stats for Existing Data)
DO $$
BEGIN
  -- Bulk update stats per customer
  WITH calculated_stats AS (
      SELECT 
          customer_id, 
          restaurant_id, 
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'completed') AND status NOT IN ('cancelled', 'void')) as real_count,
          COALESCE(SUM(total_amount) FILTER (WHERE payment_status IN ('paid', 'completed') AND status NOT IN ('cancelled', 'void')), 0) as real_spent,
          MAX(created_at) FILTER (WHERE status NOT IN ('cancelled', 'void')) as real_last_at,
          COUNT(DISTINCT date(created_at)) FILTER (WHERE payment_status IN ('paid', 'completed') AND status NOT IN ('cancelled', 'void')) as real_visits
      FROM public.orders
      GROUP BY customer_id, restaurant_id
  )
  UPDATE public.restaurant_customers rc
  SET
      order_count = cs.real_count,
      total_spent = cs.real_spent,
      last_order_at = COALESCE(cs.real_last_at, rc.last_order_at),
      visit_count = cs.real_visits
  FROM calculated_stats cs
  WHERE rc.customer_id = cs.customer_id 
    AND rc.restaurant_id = cs.restaurant_id;

END $$;
