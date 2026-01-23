ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS line_discount_amount numeric(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_discount_share numeric(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_discount_base_share numeric(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount numeric(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total numeric(12, 2) DEFAULT 0;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS line_discount_amount numeric(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_discount_share numeric(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_discount_base_share numeric(12, 2) DEFAULT 0;
