-- migration: modern_customer_stats_split.sql
-- Goal: Eliminate "column id does not exist" and ensure split stats work correctly.
-- This version is "Ultra-Safe": it avoids querying the table it's triggered on when possible and handles arrays safely.

-- 0. Helper to ensure uniqueness in arrays (Defined first)
CREATE OR REPLACE FUNCTION public.array_distinct(anyarray)
RETURNS anyarray AS $$
  SELECT ARRAY(SELECT DISTINCT unnest($1) WHERE $1 IS NOT NULL);
$$ LANGUAGE sql IMMUTABLE;

-- 1. Helper Function: Get total customer count for an order
CREATE OR REPLACE FUNCTION public.get_order_customer_count(p_order_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_count NUMERIC;
BEGIN
    SELECT COUNT(*)::NUMERIC INTO v_count
    FROM (
        -- Combine primary customer from order and any additional customers from junction
        SELECT o_inner.customer_id FROM public.orders o_inner WHERE o_inner.id = p_order_id AND o_inner.customer_id IS NOT NULL
        UNION
        SELECT oc_inner.customer_id FROM public.order_customers oc_inner WHERE oc_inner.order_id = p_order_id
    ) c;
    RETURN COALESCE(NULLIF(v_count, 0), 1);
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Core Logic: Recalculate stats for a set of customers at a restaurant
CREATE OR REPLACE FUNCTION public.recalculate_customer_stats(p_cust_ids UUID[], p_restaurant_id UUID)
RETURNS VOID AS $$
DECLARE
  curr_cust UUID;
  v_allow_multiple BOOLEAN;
BEGIN
  IF p_cust_ids IS NULL OR array_length(p_cust_ids, 1) IS NULL THEN RETURN; END IF;

  -- 1. Get configuration
  SELECT COALESCE(rp.allow_multiple_customers_per_order, false) INTO v_allow_multiple
  FROM public.restaurant_profiles rp
  WHERE rp.restaurant_id = p_restaurant_id;

  FOREACH curr_cust IN ARRAY p_cust_ids LOOP
    IF curr_cust IS NOT NULL THEN
      IF v_allow_multiple THEN
        -- MULTIPLE CUSTOMER LOGIC: Split total spent across all linked customers
        UPDATE public.restaurant_customers rc
        SET
          order_count = (
              SELECT COUNT(DISTINCT o.id)::int
              FROM public.orders o
              LEFT JOIN public.order_customers oc ON oc.order_id = o.id
              WHERE (o.customer_id = curr_cust OR oc.customer_id = curr_cust)
                AND o.restaurant_id = p_restaurant_id
                AND o.payment_status IN ('paid', 'completed')
                AND o.status NOT IN ('cancelled', 'void')
          ),
          total_spent = (
              SELECT COALESCE(SUM(o.total_amount / public.get_order_customer_count(o.id)), 0)
              FROM public.orders o
              LEFT JOIN public.order_customers oc ON oc.order_id = o.id
              WHERE (o.customer_id = curr_cust OR oc.customer_id = curr_cust)
                AND o.restaurant_id = p_restaurant_id
                AND o.payment_status IN ('paid', 'completed')
                AND o.status NOT IN ('cancelled', 'void')
          ),
          visit_count = (
              SELECT COUNT(DISTINCT date(o.created_at))::int
              FROM public.orders o
              LEFT JOIN public.order_customers oc ON oc.order_id = o.id
              WHERE (o.customer_id = curr_cust OR oc.customer_id = curr_cust)
                AND o.restaurant_id = p_restaurant_id
                AND o.payment_status IN ('paid', 'completed')
                AND o.status NOT IN ('cancelled', 'void')
          ),
          last_order_at = (
              SELECT MAX(o.created_at)
              FROM public.orders o
              LEFT JOIN public.order_customers oc ON oc.order_id = o.id
              WHERE (o.customer_id = curr_cust OR oc.customer_id = curr_cust)
                AND o.restaurant_id = p_restaurant_id
                AND o.status NOT IN ('cancelled', 'void')
          ),
          first_order_at = (
              SELECT MIN(o.created_at)
              FROM public.orders o
              LEFT JOIN public.order_customers oc ON oc.order_id = o.id
              WHERE (o.customer_id = curr_cust OR oc.customer_id = curr_cust)
                AND o.restaurant_id = p_restaurant_id
                AND o.status NOT IN ('cancelled', 'void')
          ),
          updated_at = NOW()
        WHERE rc.customer_id = curr_cust AND rc.restaurant_id = p_restaurant_id;
      ELSE
        -- LEGACY SINGLE CUSTOMER LOGIC: Standard updates
        UPDATE public.restaurant_customers rc
        SET
          order_count = (
              SELECT COUNT(*)::int
              FROM public.orders lo
              WHERE lo.customer_id = curr_cust
                AND lo.restaurant_id = p_restaurant_id
                AND lo.payment_status IN ('paid', 'completed')
                AND lo.status NOT IN ('cancelled', 'void')
          ),
          total_spent = (
              SELECT COALESCE(SUM(lo.total_amount), 0)
              FROM public.orders lo
              WHERE lo.customer_id = curr_cust
                AND lo.restaurant_id = p_restaurant_id
                AND lo.payment_status IN ('paid', 'completed')
                AND lo.status NOT IN ('cancelled', 'void')
          ),
          visit_count = (
              SELECT COUNT(DISTINCT date(lo.created_at))::int
              FROM public.orders lo
              WHERE lo.customer_id = curr_cust
                AND lo.restaurant_id = p_restaurant_id
                AND lo.payment_status IN ('paid', 'completed')
                AND lo.status NOT IN ('cancelled', 'void')
          ),
          last_order_at = (
              SELECT MAX(lo.created_at)
              FROM public.orders lo
              WHERE lo.customer_id = curr_cust
                AND lo.restaurant_id = p_restaurant_id
                AND lo.status NOT IN ('cancelled', 'void')
          ),
          first_order_at = (
              SELECT MIN(lo.created_at)
              FROM public.orders lo
              WHERE lo.customer_id = curr_cust
                AND lo.restaurant_id = p_restaurant_id
                AND lo.status NOT IN ('cancelled', 'void')
          ),
          updated_at = NOW()
        WHERE rc.customer_id = curr_cust AND rc.restaurant_id = p_restaurant_id;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Modernized Trigger on public.orders
CREATE OR REPLACE FUNCTION public.update_customer_stats_v2()
RETURNS TRIGGER AS $$
DECLARE
  v_target_ids UUID[];
  v_rid UUID;
  v_oid UUID;
BEGIN
  -- 1. Identify Order and Restaurant Context
  IF (TG_OP = 'DELETE') THEN
    v_oid := OLD.id;
    v_rid := OLD.restaurant_id;
  ELSE
    v_oid := NEW.id;
    v_rid := NEW.restaurant_id;
  END IF;

  -- 2. Build list of customers to refresh
  v_target_ids := ARRAY[]::UUID[];
  
  -- Add from the order record itself
  IF (TG_OP IN ('INSERT', 'UPDATE') AND NEW.customer_id IS NOT NULL) THEN
      v_target_ids := v_target_ids || NEW.customer_id;
  END IF;
  IF (TG_OP IN ('UPDATE', 'DELETE') AND OLD.customer_id IS NOT NULL) THEN
      v_target_ids := v_target_ids || OLD.customer_id;
  END IF;

  -- Add anyone linked via junction table
  SELECT public.array_distinct(array_cat(v_target_ids, COALESCE(ARRAY_AGG(customer_id), ARRAY[]::UUID[])))
  INTO v_target_ids
  FROM public.order_customers
  WHERE order_id = v_oid;

  IF v_rid IS NOT NULL AND v_target_ids IS NOT NULL AND array_length(v_target_ids, 1) > 0 THEN
    PERFORM public.recalculate_customer_stats(v_target_ids, v_rid);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. New Trigger on public.order_customers (Junction Table)
CREATE OR REPLACE FUNCTION public.trg_order_customers_update_stats()
RETURNS TRIGGER AS $$
DECLARE
    v_order_id UUID;
    v_rest_id UUID;
    v_cust_ids UUID[];
BEGIN
    v_order_id := COALESCE(NEW.order_id, OLD.order_id);
    
    -- Get restaurant ID from the order
    SELECT restaurant_id INTO v_rest_id FROM public.orders WHERE id = v_order_id;
    
    -- Identify affected customers
    SELECT public.array_distinct(ARRAY_AGG(cust_id)) INTO v_cust_ids
    FROM (
        SELECT customer_id as cust_id FROM public.order_customers WHERE order_id = v_order_id
        UNION
        SELECT customer_id FROM public.orders WHERE id = v_order_id AND customer_id IS NOT NULL
        UNION
        SELECT NEW.customer_id WHERE TG_OP IN ('INSERT', 'UPDATE') AND NEW.customer_id IS NOT NULL
        UNION
        SELECT OLD.customer_id WHERE TG_OP IN ('DELETE', 'UPDATE') AND OLD.customer_id IS NOT NULL
    ) t;

    IF v_rest_id IS NOT NULL AND v_cust_ids IS NOT NULL THEN
        PERFORM public.recalculate_customer_stats(v_cust_ids, v_rest_id);
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. APPLY TRIGGERS
DROP TRIGGER IF EXISTS trg_update_customer_stats_v2 ON public.orders;
CREATE TRIGGER trg_update_customer_stats_v2
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_customer_stats_v2();

DROP TRIGGER IF EXISTS trg_order_customers_stats ON public.order_customers;
CREATE TRIGGER trg_order_customers_stats
AFTER INSERT OR DELETE OR UPDATE ON public.order_customers
FOR EACH ROW EXECUTE FUNCTION public.trg_order_customers_update_stats();

-- 6. Fix: Backfill stats when a new restaurant_customers row is created
-- This handles the race condition where an order exists before the
-- restaurant_customers row is inserted (e.g. during counter sale new-customer flow).
CREATE OR REPLACE FUNCTION public.trg_restaurant_customers_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.recalculate_customer_stats(ARRAY[NEW.customer_id], NEW.restaurant_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_restaurant_customers_backfill_stats ON public.restaurant_customers;
CREATE TRIGGER trg_restaurant_customers_backfill_stats
AFTER INSERT ON public.restaurant_customers
FOR EACH ROW EXECUTE FUNCTION public.trg_restaurant_customers_on_insert();


CREATE OR REPLACE FUNCTION public.trg_restaurant_customers_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.recalculate_customer_stats(ARRAY[NEW.customer_id], NEW.restaurant_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_restaurant_customers_backfill_stats ON public.restaurant_customers;
CREATE TRIGGER trg_restaurant_customers_backfill_stats
AFTER INSERT ON public.restaurant_customers
FOR EACH ROW EXECUTE FUNCTION public.trg_restaurant_customers_on_insert();
