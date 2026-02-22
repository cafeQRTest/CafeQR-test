-- Migration: RESTABILIZE REAL-TIME AND SCHEMA (V2)
-- Ensures ALL columns are sent in real-time payloads to fix filtering issues.

BEGIN;

-- 1. Ensure 'tables' has 'identifier' column
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS identifier TEXT;

-- Populate 'identifier' ONLY if it's missing (using table_number as source)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='table_number') THEN
        UPDATE public.tables SET identifier = table_number WHERE identifier IS NULL;
    END IF;
END $$;

-- 2. Restore status columns
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available';
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS current_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

-- 3. Set REPLICA IDENTITY FULL immediately
-- This is CRITICAL. Without this, Realtime filters on anything other than PK will FAIL.
ALTER TABLE public.tables REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.invoices REPLICA IDENTITY FULL;

-- 4. Set UPDATE Policies for 'orders' (using robust auth checks)
DROP POLICY IF EXISTS orders_update_owner ON public.orders;
CREATE POLICY orders_update_owner ON public.orders
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = orders.restaurant_id
    AND (r.owner_id = auth.uid() OR r.owner_email = auth.email())
  )
);

DROP POLICY IF EXISTS orders_update_staff ON public.orders;
CREATE POLICY orders_update_staff ON public.orders
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_staff rs
    WHERE rs.restaurant_id = orders.restaurant_id
      AND rs.staff_email = auth.email()
  )
);

-- 5. Restore Sync Trigger logic
CREATE OR REPLACE FUNCTION public.sync_table_status_from_order()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.table_number IS NOT NULL AND NEW.status <> 'completed') THEN
            UPDATE public.tables
            SET status = 'occupied', current_order_id = NEW.id, updated_at = NOW()
            WHERE restaurant_id = NEW.restaurant_id AND identifier = NEW.table_number;
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.table_number IS DISTINCT FROM NEW.table_number) THEN
             IF (OLD.table_number IS NOT NULL) THEN
                 UPDATE public.tables SET status = 'available', current_order_id = NULL, updated_at = NOW()
                 WHERE restaurant_id = NEW.restaurant_id AND identifier = OLD.table_number AND current_order_id = NEW.id;
             END IF;
             IF (NEW.table_number IS NOT NULL AND NEW.status NOT IN ('completed', 'cancelled')) THEN
                 UPDATE public.tables SET status = 'occupied', current_order_id = NEW.id, updated_at = NOW()
                 WHERE restaurant_id = NEW.restaurant_id AND identifier = NEW.table_number;
             END IF;
        END IF;
        IF (NEW.status IN ('completed', 'cancelled', 'void') AND OLD.status NOT IN ('completed', 'cancelled', 'void')) THEN
            UPDATE public.tables SET status = 'available', current_order_id = NULL, updated_at = NOW()
            WHERE current_order_id = NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_table_status_orders ON public.orders;
CREATE TRIGGER trigger_sync_table_status_orders
    AFTER INSERT OR UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_table_status_from_order();

-- 6. Ensure Publications exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'orders')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE orders; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tables')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE tables; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'invoices')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE invoices; END IF;
END $$;

COMMIT;
