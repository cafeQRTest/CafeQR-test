-- Drop the old constraint
ALTER TABLE orders DROP CONSTRAINT orders_status_check;

-- Re-create with pending_acceptance added
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('new', 'pending_acceptance', 'in_progress', 'ready', 'completed', 'cancelled'));
