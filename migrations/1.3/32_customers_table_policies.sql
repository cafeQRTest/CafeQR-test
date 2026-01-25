-- Migration: Add RLS policies for restaurant_customers table to allow restaurant staff to manage customers
-- This replaces the previous logic that targeted the global 'customers' table, which is no longer used for restaurant operations.

-- Ensure RLS is enabled
ALTER TABLE public.restaurant_customers ENABLE ROW LEVEL SECURITY;

-- Drop existing staff policies if they exist to facilitate re-runs
DROP POLICY IF EXISTS "restaurant_staff_manage_restaurant_customers" ON public.restaurant_customers;

-- Policy: Allow Staff to SELECT, INSERT, UPDATE, DELETE customers for their assigned restaurant
CREATE POLICY "restaurant_staff_manage_restaurant_customers" ON public.restaurant_customers
FOR ALL
TO authenticated
USING (
  -- Check if the current user is a staff member of the restaurant
  (
     SELECT public.is_restaurant_staff(restaurant_customers.restaurant_id)
  )
)
WITH CHECK (
  -- For INSERT/UPDATE, ensure the user is staff of the target restaurant
  (
     SELECT public.is_restaurant_staff(restaurant_customers.restaurant_id)
  )
);
