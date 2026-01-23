-- migrations/1.3/7_order_audit_fields.sql
-- adding missing audit fields to orders table to ensure parity with invoices and accurate reporting

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS line_subtotal numeric(12, 2) DEFAULT 0, -- Gross MSRP total
  ADD COLUMN IF NOT EXISTS line_discount_total numeric(12, 2) DEFAULT 0, -- Sum of direct item discounts
  ADD COLUMN IF NOT EXISTS taxable_amount numeric(12, 2) DEFAULT 0; -- Final base after all discounts

-- Update comment for existing discount_amount to clarify it represents BILL level discount
COMMENT ON COLUMN public.orders.discount_amount IS 'Represents the Order/Bill level discount only';
