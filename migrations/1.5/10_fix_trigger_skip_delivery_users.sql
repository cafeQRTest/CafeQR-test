-- =====================================================================================
-- FIX: handle_new_user trigger — skip restaurant creation for delivery-app customers
-- 
-- Problem: The trigger fires for every new Supabase user, including customers who
-- sign up via the delivery app. This creates a spurious row in `restaurants` for them.
--
-- Fix: Check raw_user_meta_data->>'app_type'. If it equals 'delivery', return early
-- without inserting into `restaurants`.
--
-- Safe to run multiple times (idempotent — uses CREATE OR REPLACE FUNCTION).
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_ea_id UUID;
BEGIN
  -- Skip restaurant creation for delivery-app customers.
  -- The delivery auth page passes data: { app_type: 'delivery' } to signInWithOtp.
  IF NEW.raw_user_meta_data->>'app_type' = 'delivery' THEN
    RETURN NEW;
  END IF;

  -- Get ID for the default 'Each' unit of measure
  SELECT id INTO default_ea_id FROM unit_of_measures WHERE short_code = 'ea' LIMIT 1;

  -- Insert a new restaurant for POS/owner users.
  -- ON CONFLICT ensures this is safe to run if the email already has a restaurant.
  INSERT INTO public.restaurants (name, owner_email, owner_id, default_uom_id)
  VALUES ('My Restaurant', NEW.email, NEW.id, default_ea_id)
  ON CONFLICT (owner_email) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The trigger binding itself stays unchanged — no need to recreate it.
-- Just replacing the function above is sufficient.

SELECT 'Delivery-user restaurant trigger fix applied successfully' AS status;
