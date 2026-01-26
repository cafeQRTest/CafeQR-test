-- 41_fix_loyalty_triggers.sql
-- Purpose: Remove legacy triggers reintroduced in migration 40 that conflict with the Node.js LoyaltyService.
-- These triggers rely on 'restaurant_loyalty_settings' which is obsolete/legacy.

BEGIN;

-- 1. Drop the legacy triggers on 'orders' table
DROP TRIGGER IF EXISTS orders_loyalty_trg ON public.orders;
DROP TRIGGER IF EXISTS orders_loyalty_points_trg ON public.orders;
DROP TRIGGER IF EXISTS award_loyalty_trg ON public.orders;
DROP TRIGGER IF EXISTS reverse_loyalty_trg ON public.orders;

-- 2. Drop the associated trigger functions to ensure clean cleanup
DROP FUNCTION IF EXISTS public.trg_orders_loyalty();
DROP FUNCTION IF EXISTS public.trg_orders_loyalty_points();
DROP FUNCTION IF EXISTS public.trg_award_loyalty();
DROP FUNCTION IF EXISTS public.trg_reverse_loyalty();
DROP FUNCTION IF EXISTS public.loyalty_award_completed_order(uuid);
DROP FUNCTION IF EXISTS public.loyalty_reverse_if_cancelled(uuid);

-- 3. Ensure invoices table has the loyalty_points_earned column (Idempotent check)
-- This was likely added in 40, but harmless to ensure.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS loyalty_points_earned integer DEFAULT 0;

COMMIT;


-- This deletes the specific trigger that is resetting your points to zero
DROP TRIGGER IF EXISTS orders_loyalty_points_trg ON public.orders;
DROP FUNCTION IF EXISTS public.trg_orders_loyalty_points();

-- This deletes the other conflicting trigger
DROP TRIGGER IF EXISTS orders_loyalty_trg ON public.orders;
DROP FUNCTION IF EXISTS public.trg_orders_loyalty();





BEGIN;

-- 1. Drop the incorrect Foreign Key constraint
ALTER TABLE public.loyalty_transactions
DROP CONSTRAINT IF EXISTS loyalty_transactions_customer_id_fkey;

-- 2. Optional: We could add a correct FK to restaurant_customers, but to be safe and unblock immediately,
--    we will just remove the bad blocking constraint.
--    (A correct constraint would require referencing both restaurant_id and customer_id)

COMMIT;

