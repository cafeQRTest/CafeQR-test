-- Add discount_amount columns to support both line-item and total-order discounts.
-- This allows explicit tracking of discounts for accounting/reporting while keeping them separate from base prices.

-- 1. Orders Table (Global/Total level)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;

-- 2. Invoices Table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;

-- 3. Order Items (Line-level)
ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;

-- 4. Invoice Items
ALTER TABLE invoice_items 
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;