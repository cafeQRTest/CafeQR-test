-- 4_fix_restaurant_profiles_columns.sql

-- Ensure columns exist in the correct table 'restaurant_profiles' (with underscore)
ALTER TABLE public.restaurant_profiles 
ADD COLUMN IF NOT EXISTS featurescustomersenabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS featuresloyaltyenabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_multiple_customers_per_order boolean DEFAULT false;

-- Informative note: 
-- An older migration 1.3/25 might have had a typo 'restaurantprofiles' (no underscore).
-- This migration ensures the columns are present in the primary table used by the application.
