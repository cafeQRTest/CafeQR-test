-- Add variant_option_id to recipes to support variant-specific ingredients
ALTER TABLE recipes
ADD COLUMN IF NOT EXISTS variant_option_id UUID REFERENCES variant_options(id) ON DELETE CASCADE;

-- Create unique indexes to ensure one recipe per item+variant
-- One for specific variants
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_item_variant 
ON recipes (menu_item_id, variant_option_id) 
WHERE variant_option_id IS NOT NULL;

-- One for the default/base recipe (where variant is null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_item_default 
ON recipes (menu_item_id) 
WHERE variant_option_id IS NULL;

-- Comment
COMMENT ON COLUMN recipes.variant_option_id IS 'Specific variant this recipe applies to. NULL means default/base recipe.';
