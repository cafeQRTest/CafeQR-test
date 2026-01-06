-- migrations/1.3/5_discount_gst_fix.sql
-- implementing the India-standard calculation sequence: Discounts BEFORE GST

-- 1. Invoices Table Enhancements
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_subtotal DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_discount_total DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS order_discount_percent DECIMAL(5, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS order_discount_total DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS taxable_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal_ex_gst DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_inc_gst DECIMAL(10, 2) DEFAULT 0;

-- 2. Invoice Items Table Enhancements
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5, 2) DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS line_net DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5, 2) DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS amount_inc_gst DECIMAL(10, 2) DEFAULT 0;

-- 3. Orders Table Enhancements
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_discount_percent DECIMAL(5, 2) DEFAULT 0;

-- 4. Order Items Table Enhancements
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5, 2) DEFAULT 0;

-- Create index for faster lookups if not exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_order_id_unique ON invoices(order_id);
