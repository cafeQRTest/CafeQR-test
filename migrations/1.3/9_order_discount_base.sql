ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_discount_base numeric(12, 2) DEFAULT 0;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS order_discount_base numeric(12, 2) DEFAULT 0;

COMMENT ON COLUMN public.orders.order_discount_base IS 'Order level discount in base (ex-tax) terms';
COMMENT ON COLUMN public.invoices.order_discount_base IS 'Order level discount in base (ex-tax) terms';