-- 9_add_delivery_feature_flags.sql
--
-- Add delivery service configuration flags to restaurant_profiles.

ALTER TABLE public.restaurant_profiles
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_webpage_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_app_enabled boolean DEFAULT false;

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
