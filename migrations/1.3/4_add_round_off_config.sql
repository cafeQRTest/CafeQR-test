-- migrations/1.3/4_add_round_off_config.sql

ALTER TABLE restaurant_profiles 
ADD COLUMN IF NOT EXISTS round_off_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS round_off_mode TEXT DEFAULT 'automatic',
ADD COLUMN IF NOT EXISTS round_off_auto_factor DECIMAL DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS round_off_manual_limit DECIMAL DEFAULT 10.0;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS round_off_amount DECIMAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS round_off_amount DECIMAL DEFAULT 0;
