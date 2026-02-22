-- Migration: FIX RLS FOR STAFF REAL-TIME
-- Grants SELECT and ALL permissions to staff/managers for real-time synchronization.

BEGIN;

-- 1. Ensure 'tables' RLS allows staff
DROP POLICY IF EXISTS tables_staff_policy ON public.tables;
CREATE POLICY tables_staff_policy ON public.tables
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_staff rs
    WHERE rs.restaurant_id = tables.restaurant_id
      AND rs.staff_email = (auth.jwt() ->> 'email')
  )
);

-- 2. Ensure 'table_sections' RLS allows staff
DROP POLICY IF EXISTS table_sections_staff_policy ON public.table_sections;
CREATE POLICY table_sections_staff_policy ON public.table_sections
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_staff rs
    WHERE rs.restaurant_id = table_sections.restaurant_id
      AND rs.staff_email = (auth.jwt() ->> 'email')
  )
);

-- 3. Ensure 'orders' RLS SELECT allows staff
DROP POLICY IF EXISTS orders_select_staff ON public.orders;
CREATE POLICY orders_select_staff ON public.orders
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_staff rs
    WHERE rs.restaurant_id = orders.restaurant_id
      AND rs.staff_email = (auth.jwt() ->> 'email')
  )
);

-- 4. Ensure 'invoices' RLS SELECT allows staff
DROP POLICY IF EXISTS invoices_select_staff ON public.invoices;
CREATE POLICY invoices_select_staff ON public.invoices
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_staff rs
    WHERE rs.restaurant_id = invoices.restaurant_id
      AND rs.staff_email = (auth.jwt() ->> 'email')
  )
);

-- 5. Re-verify REPLICA IDENTITY FULL for all relevant tables
-- This ensures filters on restaurant_id work in Realtime payloads.
ALTER TABLE public.tables REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.invoices REPLICA IDENTITY FULL;

COMMIT;
