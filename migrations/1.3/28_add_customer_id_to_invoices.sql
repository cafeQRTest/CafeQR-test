-- migrations/1.3/12_add_customer_id_to_invoices.sql
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);

-- Backfill from orders
UPDATE public.invoices i
SET customer_id = o.customer_id
FROM public.orders o
WHERE i.order_id = o.id AND i.customer_id IS NULL AND o.customer_id IS NOT NULL;
