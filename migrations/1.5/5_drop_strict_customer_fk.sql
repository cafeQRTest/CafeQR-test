-- 5_drop_strict_customer_fk.sql

-- The previous migration 1.5/2_add_multiple_customers_config.sql added a strict
-- foreign key constraint on order_customers(customer_id) referencing public.customers(id).
-- However, the application primarily uses restaurant_customers, which may not always 
-- have a corresponding entry in the global public.customers table.

ALTER TABLE public.order_customers DROP CONSTRAINT IF EXISTS fk_customer;

-- Optional: Add a comment explaining the relaxation
COMMENT ON COLUMN public.order_customers.customer_id IS 'References a customer UUID, typically from restaurant_customers table.';
