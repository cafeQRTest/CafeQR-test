-- 7_add_order_customers_computed_relationship.sql
--
-- The previous migration (5_drop_strict_customer_fk.sql) dropped the FK from
-- order_customers.customer_id → public.customers(id) because guest customers
-- only exist in restaurant_customers, creating a polymorphic UUID column.
-- 
-- Standard Foreign Keys cannot be created because restaurant_customers.customer_id
-- is not unique (a global customer can belong to multiple restaurants).
--
-- FIX: We use a PostgREST Computed Relationship (a function taking the parent table) 
-- to natively resolve the embedded join for Supabase `select()` queries.

CREATE OR REPLACE FUNCTION public.restaurant_customer(oc public.order_customers)
RETURNS SETOF public.restaurant_customers
ROWS 1
LANGUAGE sql STABLE
AS $$
  SELECT rc.* 
  FROM public.restaurant_customers rc
  JOIN public.orders o ON o.id = oc.order_id
  WHERE rc.customer_id = oc.customer_id
    AND rc.restaurant_id = o.restaurant_id
  LIMIT 1;
$$;

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
