-- Add unique constraint for item code per restaurant

-- 1. Convert empty strings to NULL (standardize)
UPDATE menu_items 
SET code_number = NULL 
WHERE code_number = '';

-- 2. Handle existing duplicates by appending a suffix
-- This finds items with the same code in the same restaurant
-- and appends "-dup-N" to the duplicates (keeping the oldest one as is)
WITH duplicates AS (
  SELECT 
    id, 
    code_number,
    ROW_NUMBER() OVER (
      PARTITION BY restaurant_id, code_number 
      ORDER BY created_at ASC
    ) as rn
  FROM menu_items
  WHERE code_number IS NOT NULL
)
UPDATE menu_items
SET code_number = menu_items.code_number || '-copy-' || (duplicates.rn - 1)
FROM duplicates
WHERE menu_items.id = duplicates.id 
  AND duplicates.rn > 1;

-- 3. Now it is safe to create the unique index
DROP INDEX IF EXISTS idx_menu_items_unique_code;

CREATE UNIQUE INDEX idx_menu_items_unique_code 
ON menu_items (restaurant_id, code_number) 
WHERE code_number IS NOT NULL;
