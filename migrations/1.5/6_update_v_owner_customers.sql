-- Update v_owner_customers view to support multiple customers per order
-- Aggregates statistics from both orders.customer_id and order_customers junction table

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
    
    -- DYNAMIC CALCULATION: Total Spent
    (
        SELECT COALESCE(SUM(o.total_amount), 0)
        FROM public.orders o
        WHERE o.restaurant_id = rc.restaurant_id
          AND o.payment_status IN ('paid', 'completed')
          AND COALESCE(o.is_credit, false) = false
          AND o.status NOT IN ('cancelled', 'void')
          AND (
            o.customer_id = rc.customer_id 
            OR EXISTS (SELECT 1 FROM public.order_customers oc WHERE oc.order_id = o.id AND oc.customer_id = rc.customer_id)
          )
    ) AS total_spent,

    -- DYNAMIC CALCULATION: Visit Count
    (
        SELECT COUNT(DISTINCT date(o.created_at))::int
        FROM public.orders o
        WHERE o.restaurant_id = rc.restaurant_id
          AND o.payment_status IN ('paid', 'completed')
          AND COALESCE(o.is_credit, false) = false
          AND o.status NOT IN ('cancelled', 'void')
          AND (
            o.customer_id = rc.customer_id 
            OR EXISTS (SELECT 1 FROM public.order_customers oc WHERE oc.order_id = o.id AND oc.customer_id = rc.customer_id)
          )
    ) AS visit_count,

    rc.last_order_at,
    rc.first_order_at,
    rc.loyalty_program_id,
    rc.created_at,

    -- DYNAMIC CALCULATION: Order Count
    ( 
        SELECT (count(DISTINCT o.id))::integer
        FROM public.orders o
        WHERE o.restaurant_id = rc.restaurant_id
          AND o.payment_status IN ('paid', 'completed')
          AND COALESCE(o.is_credit, false) = false 
          AND o.status NOT IN ('cancelled', 'void')
          AND (
            o.customer_id = rc.customer_id 
            OR EXISTS (SELECT 1 FROM public.order_customers oc WHERE oc.order_id = o.id AND oc.customer_id = rc.customer_id)
          )
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
