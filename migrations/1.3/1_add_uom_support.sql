-- Create unit_of_measures table and update menu_items & order_items
-- This enables handling different units (kg, pcs) and decimal quantities

-- 1. Create unit_of_measures table
CREATE TABLE IF NOT EXISTS unit_of_measures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL,
  short_code VARCHAR(10) NOT NULL,
  precision INTEGER DEFAULT 0, -- 0 for integer, 2 for 0.00, 3 for 0.000
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE, -- NULL for global/system defaults
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Add uom_id to menu_items
ALTER TABLE menu_items 
ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES unit_of_measures(id);

-- 3. Add uom_short_code to order_items to persist the snapshot
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS uom_short_code VARCHAR(10);

-- 4. Add default_uom_id to restaurants
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS default_uom_id UUID REFERENCES unit_of_measures(id);

-- 5. Seed default UOMs (Global) - CHANGED 'Pieces' to 'Each'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM unit_of_measures WHERE short_code = 'ea') THEN
    INSERT INTO unit_of_measures (name, short_code, precision, restaurant_id) VALUES
    ('Each', 'ea', 0, NULL),
    ('Plate', 'plt', 0, NULL),
    ('Kilogram', 'kg', 3, NULL),
    ('Gram', 'g', 0, NULL),
    ('Liter', 'l', 3, NULL),
    ('Milliliter', 'ml', 0, NULL),
    ('Portion', 'por', 0, NULL),
    ('Glass', 'gls', 0, NULL),
    ('Box', 'box', 0, NULL);
  END IF;
  
  -- Handle migration from old 'pc' if it exists in dev
  UPDATE unit_of_measures 
  SET name = 'Each', short_code = 'ea' 
  WHERE short_code = 'pc' OR name = 'Pieces';
END $$;

-- 6. Set default UOM for existing items (Each) and Restaurants
DO $$
DECLARE
  ea_id UUID;
BEGIN
  SELECT id INTO ea_id FROM unit_of_measures WHERE short_code = 'ea' LIMIT 1;
  
  IF ea_id IS NOT NULL THEN
    -- Update menu items
    UPDATE menu_items SET uom_id = ea_id WHERE uom_id IS NULL;
    
    -- Update restaurants default
    UPDATE restaurants SET default_uom_id = ea_id WHERE default_uom_id IS NULL;
  END IF;
END $$;

-- 7. Add RLS Policies for unit_of_measures
ALTER TABLE unit_of_measures ENABLE ROW LEVEL SECURITY;

-- Allow read access to all for global or own restaurant
DROP POLICY IF EXISTS "View global and own UOMs" ON unit_of_measures;
CREATE POLICY "View global and own UOMs" ON unit_of_measures
  FOR SELECT
  USING (
    restaurant_id IS NULL OR 
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_email = (auth.jwt() ->> 'email')
    ) OR
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_staff WHERE staff_email = (auth.jwt() ->> 'email')
    )
  );

-- Allow write access only to own restaurant UOMs
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

  UPDATE unit_of_measures
SET precision = 2
WHERE restaurant_id IS NULL;
