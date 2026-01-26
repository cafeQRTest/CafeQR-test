-- Migration: Move Bill Number to Orders table with automatic Daily Reset
-- This allows KOTs (Kitchen Order Tickets) to show the Bill Number immediately upon order creation.

-- 1. Add column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS bill_no INTEGER;

-- 2. Create optimized index to ensure the Trigger is extremely fast (Index Only Scan)
-- We include bill_no in the index so the MAX() function doesn't need to visit the heap
CREATE INDEX IF NOT EXISTS idx_orders_daily_bill_no 
ON public.orders (restaurant_id, created_at, bill_no);

-- 3. Define the function to assign the number
CREATE OR REPLACE FUNCTION assign_daily_bill_no()
RETURNS TRIGGER AS $$
DECLARE
    next_no INTEGER;
    today_start TIMESTAMPTZ;
    today_end TIMESTAMPTZ;
BEGIN
    -- Determine Today's boundaries in IST (Asia/Kolkata)
    -- This ensures the reset happens at 12:00 AM IST regardless of server timezone (UTC)
    today_start := date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
    today_end := today_start + INTERVAL '1 day';

    -- Find the Current Highest Bill Number for THIS restaurant, TODAY
    -- Thanks to the index, this is efficient.
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO next_no
    FROM public.orders
    WHERE restaurant_id = NEW.restaurant_id
      AND created_at >= today_start
      AND created_at < today_end;

    -- Assign it
    NEW.bill_no := next_no;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach the Trigger
DROP TRIGGER IF EXISTS trg_orders_assign_bill_no ON public.orders;

CREATE TRIGGER trg_orders_assign_bill_no
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION assign_daily_bill_no();
