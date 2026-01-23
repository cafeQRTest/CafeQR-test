-- Migrations to harden Invoice Audit Compliance and support Complex GST scenarios

-- 1. Invoices Table: Add Place of Supply and Discount fidelity
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS place_of_supply text DEFAULT 'intra_state', 
  ADD COLUMN IF NOT EXISTS discount_input_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'amount'; -- 'amount' or 'percent'

-- 2. Invoice Items: Ensure we can reprint exactly what happened even if tax rules change
ALTER TABLE public.invoice_items
  -- Flag to preserve special calculation method (Fixed Tax) so reprint doesn't try to use standard logic
  ADD COLUMN IF NOT EXISTS is_packaged_good boolean NOT NULL DEFAULT false,

  -- Store original Inclusive Price (MRP) for perfect display fidelity (e.g. 13.00 instead of 12.38)
  ADD COLUMN IF NOT EXISTS unit_price_display numeric NOT NULL DEFAULT 0,

  -- Capture Variant Name explicitly to avoid "Burger" vs "Burger (Spicy)" ambiguity on older invoices
  ADD COLUMN IF NOT EXISTS variant_name text;

-- 3. Optional: Create index for faster reporting on invoice dates
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices (invoice_date);
