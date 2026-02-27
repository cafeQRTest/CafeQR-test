-- 2_add_multiple_customers_config.sql

-- 1. Add Configuration Toggle to Restaurant Profiles
ALTER TABLE public.restaurant_profiles 
ADD COLUMN IF NOT EXISTS allow_multiple_customers_per_order boolean DEFAULT false;

-- 2. Create Junction Table for Multiple Customers per Order
CREATE TABLE IF NOT EXISTS public.order_customers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL, -- references restaurant_customers conceptually
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id),
    CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE
);

-- Index for fast lookup by order
CREATE INDEX IF NOT EXISTS idx_order_customers_order_id ON public.order_customers(order_id);

-- 3. Update Loyalty Trigger to split points among attached customers
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
  v_customer_count int;
  v_points_per_customer int;
  cust_rec record;
BEGIN
  -- CHECK: Only run if status='completed' AND payment='paid'/'completed' AND NOT Credit
  IF NOT (
      new.status = 'completed' 
      AND new.payment_status IN ('paid', 'completed') 
      AND COALESCE(new.is_credit, false) = false
  ) THEN
      RETURN new;
  END IF;

  -- Ensure we only run this once when the condition is MET
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

  -- Verify Loyalty Settings are Enabled
  SELECT * INTO s
  FROM public.restaurant_loyalty_settings
  WHERE restaurant_id = new.restaurant_id;

  IF s IS NULL OR s.enabled IS NOT TRUE THEN
    RETURN new;
  END IF;

  -- Calculate order total and qualify for minimum order value
  v_total := COALESCE(new.total_inc_tax, new.total_amount, new.total, 0);
  IF v_total < s.min_order_value THEN
    RETURN new;
  END IF;

  -- Calculate total points eligible for this order
  v_points := floor(v_total * s.points_per_rupee);
  IF v_points <= 0 THEN
    RETURN new;
  END IF;

  -- CHECK MULTIPLE CUSTOMERS:
  SELECT COUNT(*) INTO v_customer_count FROM public.order_customers WHERE order_id = new.id;

  IF v_customer_count > 0 THEN
      -- SPLIT POINTS: Divide equally, rounded down. 
      v_points_per_customer := floor(v_points / v_customer_count);
      
      IF v_points_per_customer > 0 THEN
          FOR cust_rec IN SELECT customer_id FROM public.order_customers WHERE order_id = new.id LOOP
              -- Insert transaction for each customer
              INSERT INTO public.loyalty_transactions (restaurant_id, customer_id, order_id, txn_type, points_delta, note)
              VALUES (new.restaurant_id, cust_rec.customer_id, new.id, 'earn', v_points_per_customer, 'Order completed (Split Points)');
              
              -- Update customer totals
              UPDATE public.restaurant_customers rc
              SET 
                loyalty_points = (SELECT COALESCE(SUM(points_delta), 0) FROM public.loyalty_transactions WHERE customer_id = rc.customer_id AND restaurant_id = rc.restaurant_id),
                total_points_earned = (SELECT COALESCE(SUM(points_earned), 0) + COALESCE(SUM(points_delta) FILTER (WHERE points_delta > 0), 0) FROM public.loyalty_transactions WHERE customer_id = rc.customer_id AND restaurant_id = rc.restaurant_id),
                updated_at = NOW()
              WHERE restaurant_id = new.restaurant_id AND customer_id = cust_rec.customer_id;
          END LOOP;
      END IF;

  ELSE
      -- FALLBACK: Single customer using orders.customer_id (backwards compatible)
      IF new.customer_id IS NOT NULL THEN
          INSERT INTO public.loyalty_transactions (restaurant_id, customer_id, order_id, txn_type, points_delta, note)
          VALUES (new.restaurant_id, new.customer_id, new.id, 'earn', v_points, 'Order completed');
          
          UPDATE public.restaurant_customers rc
          SET 
            loyalty_points = (SELECT COALESCE(SUM(points_delta), 0) FROM public.loyalty_transactions WHERE customer_id = rc.customer_id AND restaurant_id = rc.restaurant_id),
            total_points_earned = (SELECT COALESCE(SUM(points_earned), 0) + COALESCE(SUM(points_delta) FILTER (WHERE points_delta > 0), 0) FROM public.loyalty_transactions WHERE customer_id = rc.customer_id AND restaurant_id = rc.restaurant_id),
            updated_at = NOW()
          WHERE restaurant_id = new.restaurant_id AND customer_id = new.customer_id;
      END IF;
  END IF;

  RETURN new;
END $$;

CREATE TRIGGER orders_award_loyalty
AFTER UPDATE OF status, payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_award_loyalty();
