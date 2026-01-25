-- Migration: Drop foreign key constraints linking to the global customers table
-- This decoupling allows restaurant-specific customers (restaurant_customers) to be the primary entity.

-- 1. restaurant_customers
ALTER TABLE public.restaurant_customers
DROP CONSTRAINT IF EXISTS restaurant_customers_customer_id_fkey;

-- 2. customer_addresses
ALTER TABLE public.customer_addresses
DROP CONSTRAINT IF EXISTS customer_addresses_customer_id_fkey;

-- 3. orders (if enforced)
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;

-- 4. invoices (if enforced)
ALTER TABLE public.invoices
DROP CONSTRAINT IF EXISTS invoices_customer_id_fkey;

-- 5. credit_customers (if enforced)
ALTER TABLE public.credit_customers
DROP CONSTRAINT IF EXISTS credit_customers_customer_id_fkey;
