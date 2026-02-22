-- Migration: Setup Real-time Publications and Replication
-- This script ensures tables are enabled for Supabase Realtime idempotently

DO $$
BEGIN
    -- Enable for 'tables'
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'tables'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE tables;
    END IF;

    -- Enable for 'orders'
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    END IF;

    -- Enable for 'invoices'
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'invoices'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
    END IF;
END $$;

-- Set replica identity to FULL to ensure all columns are sent in payload
-- This is necessary for triggers and frontend filtering logic
ALTER TABLE tables REPLICA IDENTITY FULL;
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE invoices REPLICA IDENTITY FULL;
