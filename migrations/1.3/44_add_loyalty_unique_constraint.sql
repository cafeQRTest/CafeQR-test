-- 44_add_loyalty_unique_constraint.sql
-- Fixes the crash in LoyaltyService 'upsert'.
-- The code uses { onConflict: 'restaurant_id, order_id, txn_type' }.
-- This REQUIRES a Unique Constraint on these 3 columns to exist in the DB.
-- It exists in Test, but was missng in Production.

BEGIN;

ALTER TABLE public.loyalty_transactions
ADD CONSTRAINT loyalty_transactions_order_txn_unique 
UNIQUE (restaurant_id, order_id, txn_type);

COMMIT;
