-- Migration: Fix v_owner_customers to use trigger-maintained split stats
-- Problem: The previous view recalculated total_spent using SUM(total_amount) without
--          dividing by customer count, so multi-customer orders inflated each customer's total.
-- Solution: Use rc.total_spent / rc.order_count / rc.visit_count which are correctly
--           maintained by triggers in 10_modern_customer_stats_split.sql with proper split logic.

DROP VIEW IF EXISTS public.v_owner_customers CASCADE;

CREATE OR REPLACE VIEW public.v_owner_customers AS
SELECT
    rc.customer_id,
    rc.restaurant_id,
    rc.customer_no,
    rc.is_active,
    COALESCE(rc.name, c.name, ''::text) AS name,
    COALESCE(rc.phone, c.phone) AS phone,
    COALESCE(rc.email, c.email) AS email,
    rc.address,
    rc.age,

    -- Use trigger-maintained value (correctly split for multi-customer orders)
    COALESCE(rc.total_spent, 0) AS total_spent,

    -- Use trigger-maintained value
    COALESCE(rc.visit_count, 0) AS visit_count,

    rc.last_order_at,
    rc.first_order_at,
    rc.loyalty_program_id,
    rc.created_at,

    -- Use trigger-maintained value
    COALESCE(rc.order_count, 0) AS order_count,

    -- Loyalty: still dynamic (no trigger maintains these inline)
    (
        SELECT COALESCE(SUM(lt.points_delta), 0)::bigint
        FROM public.loyalty_transactions lt
        WHERE lt.customer_id = rc.customer_id
          AND lt.restaurant_id = rc.restaurant_id
    ) AS loyalty_points,

    (
        SELECT COALESCE(SUM(lt.points_earned), 0)::bigint
        FROM public.loyalty_transactions lt
        WHERE lt.customer_id = rc.customer_id
          AND lt.restaurant_id = rc.restaurant_id
    ) AS total_points_earned,

    (
        SELECT COALESCE(SUM(lt.points_redeemed), 0)::bigint
        FROM public.loyalty_transactions lt
        WHERE lt.customer_id = rc.customer_id
          AND lt.restaurant_id = rc.restaurant_id
    ) AS total_points_redeemed

FROM public.restaurant_customers rc
LEFT JOIN public.customers c ON rc.customer_id = c.id;

GRANT SELECT ON public.v_owner_customers TO authenticated;
GRANT SELECT ON public.v_owner_customers TO service_role;

COMMENT ON VIEW public.v_owner_customers IS
'Master customer view. Uses trigger-maintained stats (total_spent, order_count, visit_count)
from restaurant_customers which correctly split totals for multi-customer orders.
Loyalty points are calculated dynamically from loyalty_transactions.';
