-- 31_customer_address_management_policies.sql
-- Allow Restaurant Owners and Staff to manage customer addresses for customers linked to their restaurant.

-- 1. Drop the select-only policy if it exists
DROP POLICY IF EXISTS "addresses_select_staff" ON public.customer_addresses;
DROP POLICY IF EXISTS "addresses_management_restaurant_staff_owner" ON public.customer_addresses;

-- 2. Create a comprehensive management policy (ALL) for Owners and Staff
-- This allows SELECT, INSERT, UPDATE, and DELETE.
CREATE POLICY "addresses_management_restaurant_staff_owner"
ON public.customer_addresses
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_customers rc
    WHERE rc.customer_id = customer_addresses.customer_id
    AND (
      EXISTS (
        SELECT 1 FROM public.restaurants r 
        WHERE r.id = rc.restaurant_id 
        AND (r.owner_id = auth.uid() OR r.owner_email = auth.email())
      )
      OR is_restaurant_staff(rc.restaurant_id)
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.restaurant_customers rc
    WHERE rc.customer_id = customer_id
    AND (
      EXISTS (
        SELECT 1 FROM public.restaurants r 
        WHERE r.id = rc.restaurant_id 
        AND (r.owner_id = auth.uid() OR r.owner_email = auth.email())
      )
      OR is_restaurant_staff(rc.restaurant_id)
    )
  )
);
