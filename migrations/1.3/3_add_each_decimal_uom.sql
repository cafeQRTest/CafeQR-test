-- ============================================================================
-- Add System-Level UOM: Each (Decimal) with Precision 2
-- ============================================================================
-- Description: 
-- Adds a new system-level (global) Unit of Measure for products that are 
-- counted in decimal units (e.g., 1.5 pieces, 2.25 portions).
-- This allows restaurants to have precise measurements for items like:
-- - Partial servings (1.5 portions)
-- - Fractional counts (2.25 units)
-- - Any countable item that needs decimal precision
-- ============================================================================

-- Add the new system-level UOM
INSERT INTO unit_of_measures (name, short_code, precision, restaurant_id, is_active)
VALUES ('Each (Decimal)', 'Ea.', 2, NULL, true)
ON CONFLICT DO NOTHING;

-- Note: Using 'Ea.' (with period) to distinguish from 'Ea' (whole numbers)
-- This ensures no conflict with the existing 'Each' UOM

-- Verify the insertion
DO $$
DECLARE
  new_uom_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO new_uom_count 
  FROM unit_of_measures 
  WHERE name = 'Each (Decimal)' AND restaurant_id IS NULL;
  
  IF new_uom_count > 0 THEN
    RAISE NOTICE 'Successfully added system UOM: Each (Decimal) with precision 2';
  ELSE
    RAISE WARNING 'Failed to add system UOM: Each (Decimal)';
  END IF;
END $$;

-- ============================================================================
-- Usage Instructions:
-- ============================================================================
-- After running this migration, users will see "Each (Decimal)" as an option
-- in the UOM dropdown when creating or editing menu items.
-- 
-- When to use "Each (Decimal)" vs "Each":
-- - Use "Each" (precision 0) for whole items: 1 pizza, 2 burgers, 5 drinks
-- - Use "Each (Decimal)" (precision 2) for fractional items: 
--   * 1.5 portions of dessert
--   * 2.25 servings of appetizer
--   * 0.5 pieces of cake
-- 
-- The system will now have these global UOMs:
-- 1. Each (Ea) - precision 0 - for whole countable items
-- 2. Each (Decimal) (Ea.) - precision 2 - for decimal countable items
-- ============================================================================
