-- =====================================================================================
-- PRODUCTION-READY SIGNUP & RESTAURANT SETUP MIGRATION
-- This script handles everything needed to auto-create restaurants for new users.
-- It is idempotent (safe to run multiple times) and fixes existing schema issues.
-- =====================================================================================

BEGIN;

-- 1. SCHEMA UPDATE: Add 'owner_id' to restaurants table if missing
-- This is critical for linking restaurants to Supabase Auth users.
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- 2. DATA FIX: Backfill 'owner_id' for any existing restaurants
-- If you have existing data, this ensures they are correctly linked.
UPDATE public.restaurants 
SET owner_id = (SELECT id FROM auth.users WHERE auth.users.email = public.restaurants.owner_email)
WHERE owner_id IS NULL;

-- 3. CLEANUP: Remove any old/broken triggers to ensure a clean slate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 4. TRIGGER FUNCTION: The robust logic to create a restaurant on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
  default_ea_id UUID;
BEGIN
  -- Get ID for 'Each' unit
  SELECT id INTO default_ea_id FROM unit_of_measures WHERE short_code = 'ea' LIMIT 1;

  -- Insert a new restaurant for the user.
  -- Uses ON CONFLICT matching user's UNIQUE constraints (owner_email) to avoid crashing.
  INSERT INTO public.restaurants (name, owner_email, owner_id, default_uom_id)
  VALUES ('My Restaurant', NEW.email, NEW.id, default_ea_id)
  ON CONFLICT (owner_email) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. BIND TRIGGER: Run the function after every new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. PERMISSIONS & RLS: Ensure Dashboard can access the data
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

-- Reset policies to be clean and correct
DROP POLICY IF EXISTS "Enable select for owners" ON public.restaurants;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.restaurants;

-- Allow users to read their own restaurant (by ID or Email)
CREATE POLICY "Enable select for owners" ON public.restaurants
FOR SELECT TO authenticated
USING (owner_email = auth.email() OR owner_id = auth.uid());

-- Allow app to insert/update as needed (Trigger handles initial insert, but good to have)
GRANT ALL ON TABLE public.restaurants TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.restaurants TO authenticated, anon;

-- 7. (Optional) FIX SPECIFIC STUCK USER
-- If 'sayoojtssjayarajan@gmail.com' exists but has no restaurant, this fixes it.
INSERT INTO public.restaurants (name, owner_email, owner_id)
SELECT 'My Restaurant', email, id
FROM auth.users
WHERE email = 'sayoojtssjayarajan@gmail.com'
ON CONFLICT (owner_email) DO NOTHING;

COMMIT;

SELECT 'Signup & Restaurant Setup Migration Applied Successfully' as status;
