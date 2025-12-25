-- Add columns without default first to ensure they are NULL for existing rows (if they didn't exist)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS date_ordered TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS date_ordered TIMESTAMPTZ;

-- Backfill existing data: specifically ensure legacy rows get their original creation timestamps
UPDATE orders SET date_ordered = created_at WHERE date_ordered IS NULL;
UPDATE invoices SET date_ordered = invoice_date WHERE date_ordered IS NULL;

-- Finally, set the default to NOW() for all FUTURE records.
ALTER TABLE orders ALTER COLUMN date_ordered SET DEFAULT NOW();
ALTER TABLE invoices ALTER COLUMN date_ordered SET DEFAULT NOW();

-- Update the credit orders view
-- We must DROP it first because PostgreSQL does not allow changing view columns with CREATE OR REPLACE alone if the order changes or creates conflicts.
DROP VIEW IF EXISTS v_credit_orders_effective;

CREATE OR REPLACE VIEW v_credit_orders_effective AS
SELECT 
    id, 
    created_at, 
    restaurant_id, 
    total_amount, 
    total_tax, 
    total_inc_tax, 
    status, 
    customer_name, 
    customer_phone, 
    credit_customer_id, 
    payment_method,
    date_ordered 
FROM orders 
WHERE is_credit = true AND status <> 'cancelled';
