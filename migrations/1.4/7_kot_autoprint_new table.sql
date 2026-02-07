-- Create a table to queue KOT print jobs for edited orders
-- This allows cross-device KOT printing without relying on Supabase broadcasts

CREATE TABLE IF NOT EXISTS kot_print_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  print_data JSONB NOT NULL, -- Contains the delta KOT data (added_items, removed_items, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed BOOLEAN NOT NULL DEFAULT FALSE
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_kot_print_queue_restaurant 
  ON kot_print_queue(restaurant_id, processed, created_at);

-- Enable RLS
ALTER TABLE kot_print_queue ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own restaurant's print queue
CREATE POLICY "Users can view own restaurant print queue" 
  ON kot_print_queue FOR SELECT 
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_email = auth.email()
    )
    OR
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_staff WHERE staff_email = auth.email()
    )
  );

-- Policy: Users can insert into their own restaurant's print queue
CREATE POLICY "Users can insert into own restaurant print queue" 
  ON kot_print_queue FOR INSERT 
  WITH CHECK (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_email = auth.email()
    )
    OR
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_staff WHERE staff_email = auth.email()
    )
  );

-- Auto-cleanup: Delete processed records older than 1 hour
-- (Run this periodically via a cron job or edge function)
CREATE OR REPLACE FUNCTION cleanup_old_kot_queue() 
RETURNS void AS $$
BEGIN
  DELETE FROM kot_print_queue 
  WHERE processed = TRUE 
    AND created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

SELECT 'KOT Print Queue table created successfully' as status;
ALTER PUBLICATION supabase_realtime ADD TABLE kot_print_queue;
