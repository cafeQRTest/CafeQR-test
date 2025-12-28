-- ============================================================================
-- FULL UOM & PRECISION FEATURE MIGRATION (Consolidated)
-- ============================================================================
-- Description: 
-- 1. Creates Unit of Measures table.
-- 2. Sets up 'Each' as the global standard.
-- 3. Adds necessary UOM columns (precision, short_code) to menu_items, order_items, and invoice_items.
-- 4. Increases quantity decimal precision to support fractional units.
-- 5. Configures Row Level Security (RLS) for public access to UOMs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Create unit_of_measures table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unit_of_measures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL,
  short_code VARCHAR(10) NOT NULL,
  precision INTEGER DEFAULT 0, -- 0 for integer (Each), 2 for 1.50, 4 for 1.0001
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE, -- NULL for global/system defaults
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. Add UOM references to Tables
-- ----------------------------------------------------------------------------
-- Add uom_id to menu_items
ALTER TABLE menu_items 
ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES unit_of_measures(id);

-- Add default_uom_id to restaurants
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS default_uom_id UUID REFERENCES unit_of_measures(id);

-- ----------------------------------------------------------------------------
-- 3. Add UOM Snapshot Fields to Transaction Tables
-- ----------------------------------------------------------------------------
-- order_items: Stores snapshot of UOM data at time of order
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS uom_short_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS uom_precision INTEGER DEFAULT 0;

-- invoice_items: Stores snapshot of UOM data at time of invoice
ALTER TABLE invoice_items
ADD COLUMN IF NOT EXISTS uom_precision INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS uom_short_code TEXT;

-- ----------------------------------------------------------------------------
-- 4. Increase Quantity Precision (Support for fractional units)
-- ----------------------------------------------------------------------------
-- We must convert quantity columns to unrestricted NUMERIC to prevent rounding errors.
-- Note: Views depending on these columns must strictly be dropped and recreated.

-- Drop dependent view temporarily
DROP VIEW IF EXISTS v_gst_sales_export;

-- Upgrade columns
ALTER TABLE order_items ALTER COLUMN quantity TYPE NUMERIC;
ALTER TABLE invoice_items ALTER COLUMN qty TYPE NUMERIC;

-- Recreate the view exactly as defined
CREATE OR REPLACE VIEW v_gst_sales_export AS
 SELECT i.restaurant_id,
    i.invoice_no,
    i.invoice_date::date AS invoice_date,
    i.customer_gstin,
    it.hsn,
    it.item_name,
    it.qty,
    it.unit_rate_ex_tax AS rate,
    it.line_total_ex_tax AS taxable_value,
    it.tax_rate,
        CASE
            WHEN i.igst = 0::numeric THEN it.tax_amount / 2.0
            ELSE 0::numeric
        END AS cgst_amount,
        CASE
            WHEN i.igst = 0::numeric THEN it.tax_amount / 2.0
            ELSE 0::numeric
        END AS sgst_amount,
        CASE
            WHEN i.igst > 0::numeric THEN it.tax_amount
            ELSE 0::numeric
        END AS igst_amount,
    it.line_total_inc_tax AS line_total,
    i.total_inc_tax AS invoice_total,
    i.payment_method
   FROM invoices i
     JOIN invoice_items it ON it.invoice_id = i.id
  ORDER BY i.invoice_date, i.invoice_no;

-- ----------------------------------------------------------------------------
-- 5. Configure Security (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE unit_of_measures ENABLE ROW LEVEL SECURITY;

-- Allow PUBLIC read access so all users (including unauthenticated customers) 
-- can see valid UOMs and precisions.
DROP POLICY IF EXISTS "View global and own UOMs" ON unit_of_measures;
DROP POLICY IF EXISTS "Public read access for UOMs" ON unit_of_measures;

CREATE POLICY "Public read access for UOMs"
ON public.unit_of_measures
FOR SELECT
USING (true);

-- Allow write access only to restaurant owners for their own UOMs
DROP POLICY IF EXISTS "Manage own UOMs" ON unit_of_measures;
CREATE POLICY "Manage own UOMs" ON unit_of_measures
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_email = (auth.jwt() ->> 'email')
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Seed Global Data ('Each') & Backfill
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  ea_id UUID;
BEGIN
  -- A. Ensure 'Each' exists as global UOM
  IF NOT EXISTS (SELECT 1 FROM unit_of_measures WHERE LOWER(short_code) = 'ea' AND restaurant_id IS NULL) THEN
    INSERT INTO unit_of_measures (name, short_code, precision, restaurant_id) 
    VALUES ('Each', 'Ea', 0, NULL)
    RETURNING id INTO ea_id;
  ELSE
    SELECT id INTO ea_id FROM unit_of_measures WHERE LOWER(short_code) = 'ea' AND restaurant_id IS NULL LIMIT 1;
  END IF;

  -- B. Enforce standard values for 'Each'
  UPDATE unit_of_measures SET precision = 0, name = 'Each', short_code = 'Ea' WHERE id = ea_id;

  -- C. Cleanup: Migrate any other 'global' UOMs to 'Each'
  UPDATE menu_items 
  SET uom_id = ea_id 
  WHERE uom_id IN (SELECT id FROM unit_of_measures WHERE restaurant_id IS NULL AND id != ea_id);

  UPDATE restaurants 
  SET default_uom_id = ea_id 
  WHERE default_uom_id IN (SELECT id FROM unit_of_measures WHERE restaurant_id IS NULL AND id != ea_id);

  -- Delete other global/system UOMs
  DELETE FROM unit_of_measures 
  WHERE restaurant_id IS NULL AND id != ea_id;

  -- D. Backfill defaults for existing data
  UPDATE menu_items SET uom_id = ea_id WHERE uom_id IS NULL;
  UPDATE restaurants SET default_uom_id = ea_id WHERE default_uom_id IS NULL;

END $$;
