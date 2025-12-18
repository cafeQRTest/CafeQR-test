-- ================================================================
-- FIX: RESTORE SIMPLE ACCESS FOR VARIANT LINKING TABLES
-- The previous revert script missed resetting RLS for 'menu_item_variants' and 'variant_pricing'.
-- This causes RLS violations when editing items.
-- ================================================================

-- 1. MENU ITEM VARIANTS
ALTER TABLE menu_item_variants ENABLE ROW LEVEL SECURITY;

-- Drop any complex policies existing from the hierarchy attempt
DROP POLICY IF EXISTS "Owner Access Item Variants" ON menu_item_variants;
DROP POLICY IF EXISTS "Manager Access Item Variants" ON menu_item_variants; -- if any
-- Drop any generic ones just in case
DROP POLICY IF EXISTS "Enable access for authenticated users" ON menu_item_variants;

-- Create Simple Open Policy (for authenticated users)
CREATE POLICY "Enable access for authenticated users" 
ON menu_item_variants 
FOR ALL 
USING (auth.role() = 'authenticated');


-- 2. VARIANT PRICING
ALTER TABLE variant_pricing ENABLE ROW LEVEL SECURITY;

-- Drop complex policies
DROP POLICY IF EXISTS "Owner Access Variant Pricing" ON variant_pricing;
DROP POLICY IF EXISTS "Manager Access Variant Pricing" ON variant_pricing;
DROP POLICY IF EXISTS "Enable access for authenticated users" ON variant_pricing;

-- Create Simple Open Policy
CREATE POLICY "Enable access for authenticated users" 
ON variant_pricing 
FOR ALL 
USING (auth.role() = 'authenticated');
