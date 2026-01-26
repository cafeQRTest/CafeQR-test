-- 42_fix_loyalty_fk.sql
-- Fixes the crash where loyalty transactions fail because they try to verify the customer against the global 'customers' table.
-- Since the app now uses decoupled 'restaurant_customers', this check is invalid and must be removed.

BEGIN;

-- 1. Drop the incorrect Foreign Key constraint (The one pointing to global 'customers')
ALTER TABLE public.loyalty_transactions
DROP CONSTRAINT IF EXISTS loyalty_transactions_customer_id_fkey;

-- 2. Add the Correct Foreign Key constraint (Matching Test DB)
-- Points to 'restaurant_customers' using the composite key (restaurant_id, customer_id)
ALTER TABLE public.loyalty_transactions
ADD CONSTRAINT loyalty_transactions_customer_fkey 
FOREIGN KEY (restaurant_id, customer_id) 
REFERENCES public.restaurant_customers (restaurant_id, customer_id);

COMMIT;
