-- ==========================================
-- DYNAMIC CUSTOMER METRICS (LOYALTY & ORDERS)
-- Removes redundant columns and uses dynamic View
-- ==========================================

-- 0. Drop triggers and ledger attempts (Cleanup)
-- These triggers were trying to update cached columns that are now removed
DROP TRIGGER IF EXISTS trg_update_customer_order_count ON public.orders;
DROP TRIGGER IF EXISTS orders_sync_customer_stats ON public.orders;
DROP FUNCTION IF EXISTS update_customer_order_count() CASCADE;
DROP FUNCTION IF EXISTS trg_orders_sync_customer_stats() CASCADE;

-- 1. Drop the view temporarily to allow column changes
DROP VIEW IF EXISTS v_owner_customers CASCADE;

-- 2. Remove redundant columns from restaurant_customers
DO $$ 
BEGIN 
    ALTER TABLE restaurant_customers DROP COLUMN IF EXISTS loyalty_points CASCADE;
    ALTER TABLE restaurant_customers DROP COLUMN IF EXISTS total_points_earned CASCADE;
    ALTER TABLE restaurant_customers DROP COLUMN IF EXISTS total_points_redeemed CASCADE;
    ALTER TABLE restaurant_customers DROP COLUMN IF EXISTS order_count CASCADE;
END $$;

-- 3. Create the master dynamic View
-- This View provides real-time accurate counts for Orders and Loyalty Points
CREATE OR REPLACE VIEW v_owner_customers AS
SELECT 
    rc.*,
    -- Dynamic Order Count: Only Paid, Non-Credit orders
    (
        SELECT COUNT(*)::INT 
        FROM orders o 
        WHERE o.customer_id = rc.customer_id 
          AND o.payment_status = 'paid' 
          AND COALESCE(o.is_credit, false) = false
          AND o.restaurant_id = rc.restaurant_id
    ) as order_count,
    -- Dynamic Loyalty Balance: Sum of all transaction deltas
    (
        SELECT COALESCE(SUM(points_delta), 0)::BIGINT 
        FROM loyalty_transactions lt 
        WHERE lt.customer_id = rc.customer_id
          AND lt.restaurant_id = rc.restaurant_id
    ) as loyalty_points,
    -- Dynamic Lifetime Earned
    (
        SELECT COALESCE(SUM(points_earned), 0)::BIGINT 
        FROM loyalty_transactions lt 
        WHERE lt.customer_id = rc.customer_id
          AND lt.restaurant_id = rc.restaurant_id
    ) as total_points_earned,
     -- Dynamic Lifetime Redeemed
    (
        SELECT COALESCE(SUM(points_redeemed), 0)::BIGINT 
        FROM loyalty_transactions lt 
        WHERE lt.customer_id = rc.customer_id
          AND lt.restaurant_id = rc.restaurant_id
    ) as total_points_redeemed
FROM restaurant_customers rc;

-- 4. Add comments
COMMENT ON VIEW v_owner_customers IS 'Master dynamic view. Calculates loyalty and order counts in real-time from source tables.';

-- 5. Verification Query
-- SELECT * FROM v_owner_customers LIMIT 1;

