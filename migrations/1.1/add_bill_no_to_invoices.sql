-- Add bill_no column to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bill_no INTEGER;

-- Create an index for faster daily queries
CREATE INDEX IF NOT EXISTS idx_invoices_restaurant_date_bill_no 
ON invoices (restaurant_id, created_at, bill_no);
 