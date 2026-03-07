-- 12_reset_multiple_customers_default.sql
-- Force the allow_multiple_customers_per_order to false by default for all existing records.

-- 1. Update any existing records to false if they are NULL or TRUE. 
-- Note: User specifically requested this to be FALSE as default.
UPDATE public.restaurant_profiles 
SET allow_multiple_customers_per_order = false 
WHERE allow_multiple_customers_per_order IS NOT FALSE;

-- 2. Ensure the column has the correct default for future rows (already should be, but reinforcing)
ALTER TABLE public.restaurant_profiles 
ALTER COLUMN allow_multiple_customers_per_order SET DEFAULT false;
