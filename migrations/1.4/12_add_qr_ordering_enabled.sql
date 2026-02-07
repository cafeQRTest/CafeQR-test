-- Add qr_ordering_enabled to restaurant_profiles
ALTER TABLE restaurant_profiles ADD COLUMN IF NOT EXISTS qr_ordering_enabled BOOLEAN DEFAULT False;
