-- 1) Allow decimal quantities on order line items
ALTER TABLE public.order_items
  ALTER COLUMN quantity TYPE numeric(10,2) USING (quantity::numeric(10,2)),
  ALTER COLUMN quantity SET DEFAULT 1.00;

-- Optional but recommended: bill_items.quantity is also integer in your schema
-- If bill_items is still used anywhere, align it too.
ALTER TABLE public.bill_items
  ALTER COLUMN quantity TYPE numeric(10,2) USING (quantity::numeric(10,2));

-- Optional safety constraints
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0);

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_stock_non_negative CHECK (current_stock >= 0);
