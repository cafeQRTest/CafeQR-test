-- 11_consolidate_customers.sql: Unify Customer Data & Add Hash IDs

-- 1. Schema Upgrades for public.restaurant_customers
-- Add customer_no (Text) and is_active (Boolean)
ALTER TABLE public.restaurant_customers
  ADD COLUMN IF NOT EXISTS customer_no TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add uniqueness to customer_no per restaurant (or global? Plan implied per restaurant table, but uniqueness is key)
-- We'll make it unique per restaurant for safety, or globally unique if easier. 
-- Let's make it unique per restaurant so collisions are rare/handled.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_customers_customer_no_key') THEN
    ALTER TABLE public.restaurant_customers ADD CONSTRAINT restaurant_customers_customer_no_key UNIQUE (restaurant_id, customer_no);
  END IF;
END $$;

-- 2. Function to generate Random Alphanumeric Hash (8 chars)
CREATE OR REPLACE FUNCTION generate_customer_hash() RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER := 0;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 3. Migration Logic: Import Snapshot Customers from Orders
DO $$
DECLARE
  r RECORD;
  cust_id UUID;
  new_hash TEXT;
BEGIN
  -- Loop through all unique Name/Phone snapshots in orders that don't have a linked customer_id yet
  -- OR where the link exists but maybe no restaurant_customer entry exists.
  -- Simplified: We look at all orders.
  
  FOR r IN 
    SELECT DISTINCT restaurant_id, customer_phone, customer_name
    FROM public.orders 
    WHERE customer_phone IS NOT NULL AND customer_phone <> '' 
      AND restaurant_id IS NOT NULL
  LOOP
    
    -- A. Ensure Global Customer Exists
    -- Try find by phone
    SELECT id INTO cust_id FROM public.customers WHERE phone = r.customer_phone LIMIT 1;
    
    IF cust_id IS NULL THEN
       INSERT INTO public.customers (phone, name)
       VALUES (r.customer_phone, r.customer_name)
       RETURNING id INTO cust_id;
    END IF;
    
    -- B. Ensure Restaurant Customer Link Exists
    IF NOT EXISTS (SELECT 1 FROM public.restaurant_customers WHERE restaurant_id = r.restaurant_id AND customer_id = cust_id) THEN
       INSERT INTO public.restaurant_customers (restaurant_id, customer_id, first_order_at, order_count, total_spent)
       VALUES (r.restaurant_id, cust_id, NOW(), 0, 0); -- Stats will be recalculated or are 0 for now
    END IF;
    
    -- C. Link Order to Customer (if not linked)
    UPDATE public.orders 
    SET customer_id = cust_id 
    WHERE restaurant_id = r.restaurant_id AND customer_phone = r.customer_phone AND customer_id IS NULL;
    
  END LOOP;
  
  -- 4. Backfill Hashes for any Restaurant Customer missing one
  FOR r IN SELECT * FROM public.restaurant_customers WHERE customer_no IS NULL LOOP
     LOOP
       new_hash := generate_customer_hash();
       BEGIN
          UPDATE public.restaurant_customers 
          SET customer_no = new_hash 
          WHERE restaurant_id = r.restaurant_id AND customer_id = r.customer_id;
          EXIT; -- Success
       EXCEPTION WHEN unique_violation THEN
          -- Retry if collision
       END;
     END LOOP;
  END LOOP;

END $$;

-- 5. Helper Script to Update Stats (Optional but good for data integrity)
-- Recalculate aggregates for restaurant_customers based on linked Active orders
-- (This ensures the CRM shows correct data immediately)
UPDATE public.restaurant_customers rc
SET 
  order_count = sub.cnt,
  total_spent = sub.spent,
  last_order_at = sub.last_date,
  first_order_at = COALESCE(rc.first_order_at, sub.first_date)
FROM (
  SELECT customer_id, restaurant_id, 
         COUNT(*) as cnt, 
         COALESCE(SUM(total_amount), 0) as spent,
         MIN(created_at) as first_date,
         MAX(created_at) as last_date
  FROM public.orders
  WHERE status <> 'cancelled' AND status <> 'void'
  GROUP BY customer_id, restaurant_id
) sub
WHERE rc.customer_id = sub.customer_id AND rc.restaurant_id = sub.restaurant_id;
