-- Migration to link Delivery App users to their orders
-- This allows the Order History to populate correctly for the logged-in customer.
-- 1. Adding user_id column with a foreign key reference to Supabase Auth
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
-- 2. Adding an index for high-performance history lookups
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
