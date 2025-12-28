ALTER TABLE public.restaurant_profiles ENABLE ROW LEVEL SECURITY;

-- Public can read profiles needed for discovery (you can tighten later if desired)
DROP POLICY IF EXISTS rest_profile_public_read ON public.restaurant_profiles;
CREATE POLICY rest_profile_public_read
ON public.restaurant_profiles
FOR SELECT
USING (true);

-- Only restaurant members can update (including delivery_app_enabled)
DROP POLICY IF EXISTS rest_profile_update_member ON public.restaurant_profiles;
CREATE POLICY rest_profile_update_member
ON public.restaurant_profiles
FOR UPDATE
USING (public.is_restaurant_member(restaurant_id))
WITH CHECK (public.is_restaurant_member(restaurant_id));
