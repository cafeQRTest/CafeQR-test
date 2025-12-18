-- ================================================================
-- PRODUCT VARIANTS FEATURE - COMPLETE DATABASE MIGRATION (FIXED)
-- ================================================================
-- This migration adds a complete variant system for menu items
-- Example: Mandi with variants (Quarter, Half, Full) at different prices
-- ================================================================

-- ================================================================
-- STEP 0: CHECK EXISTING SCHEMA
-- ================================================================
-- Run this first to see your database structure
-- ================================================================

/*
-- Check if restaurant_profiles table exists and its structure
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'restaurant_profiles'
ORDER BY ordinal_position;

-- Check menu_items structure
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'menu_items'
ORDER BY ordinal_position;

-- Check order_items structure
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'order_items'
ORDER BY ordinal_position;
*/

-- ================================================================
-- STEP 1: CREATE VARIANT TEMPLATES TABLE
-- ================================================================
-- This table stores reusable variant definitions
-- Example: "Portion Size", "Spice Level", etc.
-- ================================================================

CREATE TABLE IF NOT EXISTS variant_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_variant_templates_name ON variant_templates(name);

COMMENT ON TABLE variant_templates IS 'Stores reusable variant types (e.g., Portion Size, Spice Level)';

-- ================================================================
-- STEP 2: CREATE VARIANT OPTIONS TABLE
-- ================================================================
-- This table stores individual variant options
-- Example: For "Portion Size": Quarter, Half, Full
-- ================================================================

CREATE TABLE IF NOT EXISTS variant_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES variant_templates(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_variant_options_template ON variant_options(template_id);

COMMENT ON TABLE variant_options IS 'Individual options for variant templates (e.g., Quarter, Half, Full)';

-- ================================================================
-- STEP 3: UPDATE MENU_ITEMS TABLE
-- ================================================================
-- Add flag to indicate if a menu item uses variants
-- ================================================================

ALTER TABLE menu_items 
ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT false;

COMMENT ON COLUMN menu_items.has_variants IS 'True if this item has variant options';

-- ================================================================
-- STEP 4: CREATE MENU ITEM VARIANTS MAPPING TABLE
-- ================================================================
-- Links menu items to variant templates
-- Example: "Mandi" item uses "Portion Size" template
-- ================================================================

CREATE TABLE IF NOT EXISTS menu_item_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  template_id UUID REFERENCES variant_templates(id) ON DELETE CASCADE,
  is_required BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(menu_item_id, template_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_menu_item_variants_item ON menu_item_variants(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_variants_template ON menu_item_variants(template_id);

COMMENT ON TABLE menu_item_variants IS 'Links menu items to their variant templates';

-- ================================================================
-- STEP 5: CREATE VARIANT PRICING TABLE
-- ================================================================
-- Stores specific prices for each variant of each menu item
-- Example: Mandi + Full portion = ₹650
-- ================================================================

CREATE TABLE IF NOT EXISTS variant_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  option_id UUID REFERENCES variant_options(id) ON DELETE CASCADE,
  price DECIMAL(10,2) NOT NULL,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(menu_item_id, option_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_variant_pricing_item ON variant_pricing(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_variant_pricing_option ON variant_pricing(option_id);

COMMENT ON TABLE variant_pricing IS 'Stores specific prices for menu item variants';

-- ================================================================
-- STEP 6: UPDATE ORDER_ITEMS TABLE
-- ================================================================
-- Add columns to track which variant was ordered
-- ================================================================

ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS variant_option_id UUID REFERENCES variant_options(id),
ADD COLUMN IF NOT EXISTS variant_name VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(variant_option_id);

COMMENT ON COLUMN order_items.variant_option_id IS 'Reference to selected variant option';
COMMENT ON COLUMN order_items.variant_name IS 'Stored variant name for historical record';

-- ================================================================
-- STEP 7: INSERT DEFAULT VARIANT TEMPLATES
-- ================================================================
-- Pre-populate with common restaurant variant types
-- ================================================================

INSERT INTO variant_templates (name, description, display_order) VALUES
  ('Portion Size', 'Standard portion sizes (Quarter, Half, Full)', 1),
  ('Serving Size', 'Number of servings or pieces', 2),
  ('Size', 'General size options (Small, Medium, Large)', 3)
ON CONFLICT (name) DO NOTHING;

-- ================================================================
-- STEP 8: INSERT DEFAULT VARIANT OPTIONS
-- ================================================================
-- Pre-populate with common portion sizes
-- ================================================================

-- Get template IDs and insert options
DO $$
DECLARE
  portion_size_id UUID;
  serving_size_id UUID;
  size_id UUID;
BEGIN
  -- Get template IDs
  SELECT id INTO portion_size_id FROM variant_templates WHERE name = 'Portion Size';
  SELECT id INTO serving_size_id FROM variant_templates WHERE name = 'Serving Size';
  SELECT id INTO size_id FROM variant_templates WHERE name = 'Size';
  
  -- Insert Portion Size options
  IF portion_size_id IS NOT NULL THEN
    INSERT INTO variant_options (template_id, name, display_order) VALUES
      (portion_size_id, 'Quarter', 1),
      (portion_size_id, 'Half', 2),
      (portion_size_id, 'Full', 3)
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Insert Serving Size options
  IF serving_size_id IS NOT NULL THEN
    INSERT INTO variant_options (template_id, name, display_order) VALUES
      (serving_size_id, 'Single', 1),
      (serving_size_id, 'Double', 2),
      (serving_size_id, 'Family Pack', 3)
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Insert Size options
  IF size_id IS NOT NULL THEN
    INSERT INTO variant_options (template_id, name, display_order) VALUES
      (size_id, 'Small', 1),
      (size_id, 'Medium', 2),
      (size_id, 'Large', 3),
      (size_id, 'Extra Large', 4)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ================================================================
-- STEP 9: CREATE HELPER FUNCTIONS
-- ================================================================

-- Function to get all variants for a menu item
CREATE OR REPLACE FUNCTION get_menu_item_variants(item_id UUID)
RETURNS TABLE (
  variant_option_id UUID,
  variant_name VARCHAR,
  variant_price DECIMAL,
  is_available BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vo.id as variant_option_id,
    vo.name as variant_name,
    vp.price as variant_price,
    vp.is_available
  FROM variant_options vo
  JOIN variant_pricing vp ON vo.id = vp.option_id
  JOIN menu_item_variants miv ON vo.template_id = miv.template_id
  WHERE miv.menu_item_id = item_id
    AND vo.is_active = true
    AND vp.is_available = true
  ORDER BY vo.display_order;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_menu_item_variants IS 'Returns all available variants for a menu item';

-- ================================================================
-- STEP 10: CREATE VIEWS FOR EASY QUERYING
-- ================================================================

-- View to get menu items with their variants
CREATE OR REPLACE VIEW menu_items_with_variants AS
SELECT 
  mi.id,
  mi.name,
  mi.category,
  mi.price as base_price,
  mi.has_variants,
  mi.veg,
  mi.status,
  mi.image_url,
  mi.description,
  COALESCE(
    json_agg(
      json_build_object(
        'variant_id', vo.id,
        'variant_name', vo.name,
        'price', vp.price,
        'is_available', vp.is_available,
        'template_name', vt.name
      ) ORDER BY vo.display_order
    ) FILTER (WHERE vo.id IS NOT NULL),
    '[]'::json
  ) as variants
FROM menu_items mi
LEFT JOIN menu_item_variants miv ON mi.id = miv.menu_item_id
LEFT JOIN variant_templates vt ON miv.template_id = vt.id
LEFT JOIN variant_options vo ON miv.template_id = vo.template_id AND vo.is_active = true
LEFT JOIN variant_pricing vp ON mi.id = vp.menu_item_id AND vo.id = vp.option_id
WHERE mi.status != 'deleted'
GROUP BY mi.id;

COMMENT ON VIEW menu_items_with_variants IS 'Menu items with their variants in JSON format';

-- ================================================================
-- EXAMPLE USAGE: ADD VARIANT TO EXISTING MENU ITEM
-- ================================================================

/*
-- STEP-BY-STEP EXAMPLE: Add variants to "Chicken Mandi"
-- ================================================================

-- Step 1: Find your menu item
SELECT id, name FROM menu_items WHERE name LIKE '%Mandi%';
-- Copy the ID, let's say it's: 'abc-123-def-456'

-- Step 2: Find the Portion Size template
SELECT id FROM variant_templates WHERE name = 'Portion Size';
-- Copy the ID, let's say it's: 'template-123'

-- Step 3: Enable variants for the menu item
UPDATE menu_items 
SET has_variants = true 
WHERE id = 'abc-123-def-456';

-- Step 4: Link menu item to variant template
INSERT INTO menu_item_variants (menu_item_id, template_id, is_required)
VALUES ('abc-123-def-456', 'template-123', true);

-- Step 5: Get variant option IDs
SELECT id, name FROM variant_options 
WHERE template_id = 'template-123'
ORDER BY display_order;

-- You'll get:
-- id: 'quarter-id', name: 'Quarter'
-- id: 'half-id', name: 'Half'
-- id: 'full-id', name: 'Full'

-- Step 6: Set prices for each variant
INSERT INTO variant_pricing (menu_item_id, option_id, price, is_available) VALUES
  ('abc-123-def-456', 'quarter-id', 200.00, true),
  ('abc-123-def-456', 'half-id', 350.00, true),
  ('abc-123-def-456', 'full-id', 650.00, true);

-- Step 7: Verify it worked
SELECT * FROM menu_items_with_variants 
WHERE name LIKE '%Mandi%';
*/

-- ================================================================
-- QUICK TEST QUERIES
-- ================================================================

/*
-- See all variant templates
SELECT * FROM variant_templates ORDER BY display_order;

-- See all variant options
SELECT 
  vt.name as template,
  vo.name as option,
  vo.display_order
FROM variant_options vo
JOIN variant_templates vt ON vo.template_id = vt.id
ORDER BY vt.display_order, vo.display_order;

-- See menu items with variants enabled
SELECT id, name, has_variants 
FROM menu_items 
WHERE has_variants = true;

-- See all variants for a specific menu item
SELECT * FROM get_menu_item_variants('your-menu-item-id');

-- See complete view
SELECT * FROM menu_items_with_variants WHERE has_variants = true;
*/

-- ================================================================
-- VERIFICATION QUERIES - RUN AFTER MIGRATION
-- ================================================================

-- Check if all tables were created
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name IN (
    'variant_templates',
    'variant_options', 
    'menu_item_variants',
    'variant_pricing'
  )
ORDER BY table_name;

-- Check if columns were added
SELECT 'menu_items.has_variants exists' as check_result
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'menu_items' AND column_name = 'has_variants'
);

-- Count default data
SELECT 
  vt.name as template,
  COUNT(vo.id) as options_count
FROM variant_templates vt
LEFT JOIN variant_options vo ON vt.id = vo.template_id
GROUP BY vt.id, vt.name
ORDER BY vt.display_order;

-- ================================================================
-- ROLLBACK (If needed)
-- ================================================================

/*
-- WARNING: This will delete all variant data!

DROP VIEW IF EXISTS menu_items_with_variants CASCADE;
DROP FUNCTION IF EXISTS get_menu_item_variants(UUID);
DROP TABLE IF EXISTS variant_pricing CASCADE;
DROP TABLE IF EXISTS menu_item_variants CASCADE;
DROP TABLE IF EXISTS variant_options CASCADE;
DROP TABLE IF EXISTS variant_templates CASCADE;
ALTER TABLE menu_items DROP COLUMN IF EXISTS has_variants;
ALTER TABLE order_items DROP COLUMN IF EXISTS variant_option_id;
ALTER TABLE order_items DROP COLUMN IF EXISTS variant_name;
*/

-- ================================================================
-- SUCCESS MESSAGE
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ VARIANTS FEATURE MIGRATION COMPLETED SUCCESSFULLY!';
  RAISE NOTICE '📋 Created 4 new tables: variant_templates, variant_options, menu_item_variants, variant_pricing';
  RAISE NOTICE '🔧 Added columns to menu_items and order_items';
  RAISE NOTICE '📊 Pre-loaded 3 variant templates with default options';
  RAISE NOTICE '🎯 Run verification queries above to confirm everything works!';
END $$;
