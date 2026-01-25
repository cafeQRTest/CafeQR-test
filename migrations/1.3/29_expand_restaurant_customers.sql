-- migrations/1.3/13_expand_restaurant_customers.sql

-- 1. Add fields to restaurant_customers
ALTER TABLE public.restaurant_customers
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT;

-- 2. Backfill from global customers table
UPDATE public.restaurant_customers rc
SET 
  name = c.name,
  email = c.email,
  phone = c.phone
FROM public.customers c
WHERE rc.customer_id = c.id;

-- 3. Backfill address from default customer address (best effort)
UPDATE public.restaurant_customers rc
SET 
  address = (
    SELECT line1 || COALESCE(', ' || line2, '') || COALESCE(', ' || city, '') || COALESCE(' - ' || pincode, '')
    FROM public.customer_addresses ca
    WHERE ca.customer_id = rc.customer_id
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1
  );

-- 4. Update existing migration logic if necessary (backfilling from orders too)
-- Since 11_consolidate_customers.sql already ran or will run, we should ensure it also fills these.
