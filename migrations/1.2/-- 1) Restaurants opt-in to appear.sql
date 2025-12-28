-- 1) Restaurants opt-in to appear in the delivery app
ALTER TABLE public.restaurant_profiles
ADD COLUMN IF NOT EXISTS delivery_app_enabled boolean NOT NULL DEFAULT false;
