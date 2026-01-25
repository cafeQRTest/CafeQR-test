-- migration 37: Fix loyalty_transactions for voiding and column names
-- This migration ensures txn_type allows 'void' and renames legacy 'type'/'points' columns if they exist.

DO $$ 
BEGIN 
    -- 1. Rename 'type' to 'txn_type' if it exists
    BEGIN
        ALTER TABLE loyalty_transactions RENAME COLUMN type TO txn_type;
    EXCEPTION WHEN undefined_column THEN NULL; END;

    -- 2. Rename 'points' to 'points_delta' if it exists
    BEGIN
        ALTER TABLE loyalty_transactions RENAME COLUMN points TO points_delta;
    EXCEPTION WHEN undefined_column THEN NULL; END;

    -- 3. Update the txn_type check constraint
    -- First, drop the old ones (might be named differently depending on which script created it)
    ALTER TABLE loyalty_transactions DROP CONSTRAINT IF EXISTS loyalty_transactions_type_check;
    ALTER TABLE loyalty_transactions DROP CONSTRAINT IF EXISTS loyalty_transactions_txn_type_check;
    
    -- Add the comprehensive constraint
    ALTER TABLE loyalty_transactions ADD CONSTRAINT loyalty_transactions_txn_type_check 
        CHECK (txn_type IN ('earn', 'redeem', 'adjust', 'expire', 'void'));

    -- 4. Ensure other expected columns exist (idempotent)
    BEGIN
        ALTER TABLE loyalty_transactions ADD COLUMN points_earned BIGINT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END;

    BEGIN
        ALTER TABLE loyalty_transactions ADD COLUMN points_redeemed BIGINT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END;

    -- 5. Fix the unique index that prevents multiple reversals/adjustments per order
    -- The old index 'uniq_loyalty_order_earn' often covers (restaurant_id, order_id, txn_type)
    -- which prevents having both a 'void_earn' and 'void_redeem' (both mapped to 'adjust') for one order.
    DROP INDEX IF EXISTS uniq_loyalty_order_earn;
    
    -- Recreate it to only prevent duplicate 'earn' or 'redeem' transactions per order
    -- allowing multiple 'adjust' or 'void' transactions.
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_loyalty_order_earn_redeem
        ON loyalty_transactions (restaurant_id, order_id, txn_type)
        WHERE order_id IS NOT NULL AND txn_type IN ('earn', 'redeem');

END $$;
