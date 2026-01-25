-- ========================================================
-- COMPREHENSIVE LOYALTY & CUSTOMER METRICS SYSTEM (FINAL)
-- Consolidates all tables, functions, and dynamic views.
-- Removes all redundant columns and legacy triggers.
-- ========================================================

-- 1. LOYALTY PROGRAMS TABLE
CREATE TABLE IF NOT EXISTS loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  earning_criteria TEXT NOT NULL CHECK (earning_criteria IN ('amount_spent', 'visits', 'items_ordered')),
  amount_spent_conversion_rate NUMERIC(10,2) DEFAULT 0,
  min_order_amount NUMERIC(10,2) DEFAULT 0,
  redemption_conversion_rate NUMERIC(10,2) DEFAULT 1.0,
  redemption_min_points INTEGER DEFAULT 0,
  max_redemption_amount_per_order NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. LOYALTY TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  customer_id UUID NOT NULL, 
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  txn_type TEXT NOT NULL CHECK (txn_type IN ('earn', 'redeem', 'adjust', 'expire', 'void')),
  points_delta BIGINT NOT NULL, -- Net change (+/-)
  points_earned BIGINT DEFAULT 0,
  points_redeemed BIGINT DEFAULT 0,
  amount_value NUMERIC(10,2) DEFAULT 0, 
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_tx_cust ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_rest ON loyalty_transactions(restaurant_id);

-- 3. RESTAURANT CUSTOMERS CLEANUP (Schema Alignment)
DO $$ 
BEGIN 
    -- Ensure required columns exist
    ALTER TABLE restaurant_customers ADD COLUMN IF NOT EXISTS loyalty_program_id UUID REFERENCES loyalty_programs(id);
    ALTER TABLE restaurant_customers ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE restaurant_customers ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 0;
    ALTER TABLE restaurant_customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

    -- DROP REDUNDANT CACHED COLUMNS (We use dynamic views now)
    ALTER TABLE restaurant_customers DROP COLUMN IF EXISTS loyalty_points CASCADE;
    ALTER TABLE restaurant_customers DROP COLUMN IF EXISTS total_points_earned CASCADE;
    ALTER TABLE restaurant_customers DROP COLUMN IF EXISTS total_points_redeemed CASCADE;
    ALTER TABLE restaurant_customers DROP COLUMN IF EXISTS order_count CASCADE;
END $$;

-- 4. CLEANUP LEGACY DB LOGIC (Triggers/Functions)
-- These are the main causes of "column does not exist" errors
DROP TRIGGER IF EXISTS orders_sync_customer_stats ON public.orders;
DROP TRIGGER IF EXISTS trg_update_customer_order_count ON public.orders;
DROP TRIGGER IF EXISTS orders_loyalty_iud ON public.orders;
DROP TRIGGER IF EXISTS orders_loyalty_trigger ON public.orders;
DROP TRIGGER IF EXISTS trg_award_loyalty ON public.orders;
DROP TRIGGER IF EXISTS trg_reverse_loyalty ON public.orders;

DROP FUNCTION IF EXISTS public.trg_orders_sync_customer_stats() CASCADE;
DROP FUNCTION IF EXISTS public.update_customer_order_count() CASCADE;
DROP FUNCTION IF EXISTS public.trg_orders_loyalty_points() CASCADE;
DROP FUNCTION IF EXISTS public.trg_orders_loyalty() CASCADE;
DROP FUNCTION IF EXISTS public.trg_award_loyalty() CASCADE;
DROP FUNCTION IF EXISTS public.trg_reverse_loyalty() CASCADE;

-- 5. FIXED CUSTOMER SYNC FUNCTION (Only updates spend/dates)
CREATE OR REPLACE FUNCTION public.link_customer_to_restaurant_from_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
begin
  if new.restaurant_id is null or new.customer_id is null then
    return new;
  end if;

  INSERT INTO public.restaurant_customers (
    restaurant_id, customer_id, first_order_at, last_order_at, total_spent, is_active
  )
  VALUES (
    new.restaurant_id, new.customer_id, now(), now(), COALESCE(new.total_amount, new.total, 0), true
  )
  ON CONFLICT (restaurant_id, customer_id)
  DO UPDATE SET
    last_order_at = EXCLUDED.last_order_at,
    total_spent = COALESCE(public.restaurant_customers.total_spent, 0) + EXCLUDED.total_spent,
    updated_at = now();

  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_link_customer_to_restaurant_from_order ON public.orders;
CREATE TRIGGER trg_link_customer_to_restaurant_from_order
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.link_customer_to_restaurant_from_order();

-- 6. MASTER DYNAMIC VIEW (Source of truth for UI)
DROP VIEW IF EXISTS v_owner_customers CASCADE;

CREATE OR REPLACE VIEW v_owner_customers AS
SELECT 
    rc.customer_id,
    rc.restaurant_id,
    rc.customer_no,
    rc.is_active,
    COALESCE(rc.name, c.name, 'Guest') as name,
    COALESCE(rc.phone, c.phone) as phone,
    COALESCE(rc.email, c.email) as email,
    rc.address,
    rc.total_spent,
    rc.visit_count,
    rc.last_order_at,
    rc.first_order_at,
    rc.loyalty_program_id,
    rc.created_at,
    -- Dynamic Order Count
    (SELECT COUNT(*)::INT FROM orders o WHERE o.customer_id = rc.customer_id AND o.payment_status = 'paid' AND COALESCE(o.is_credit, false) = false AND o.restaurant_id = rc.restaurant_id) as order_count,
    -- Dynamic Loyalty Balance
    (SELECT COALESCE(SUM(points_delta), 0)::BIGINT FROM loyalty_transactions lt WHERE lt.customer_id = rc.customer_id AND lt.restaurant_id = rc.restaurant_id) as loyalty_points,
    -- Dynamic Lifetime Earned
    (SELECT COALESCE(SUM(points_earned), 0)::BIGINT FROM loyalty_transactions lt WHERE lt.customer_id = rc.customer_id AND lt.restaurant_id = rc.restaurant_id) as total_points_earned,
    -- Dynamic Lifetime Redeemed
    (SELECT COALESCE(SUM(points_redeemed), 0)::BIGINT FROM loyalty_transactions lt WHERE lt.customer_id = rc.customer_id AND lt.restaurant_id = rc.restaurant_id) as total_points_redeemed
FROM restaurant_customers rc
LEFT JOIN customers c ON rc.customer_id = c.id;

GRANT SELECT ON v_owner_customers TO authenticated;
GRANT SELECT ON v_owner_customers TO service_role;
