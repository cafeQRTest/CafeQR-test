-- Add restaurant_id to variant_templates to scope them to specific restaurants
-- This allows restaurants to have their own custom variants without cluttering other restaurants' views

-- 1. Add restaurant_id column
ALTER TABLE variant_templates
ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_variant_templates_restaurant ON variant_templates(restaurant_id);

-- 3. Update Unique Constraint
-- Old constraint was: name VARCHAR(100) NOT NULL UNIQUE
-- We need to drop that and replace it with a composite unique constraint (restaurant_id, name)
-- Note: 'name' is already NOT NULL.
-- In Postgres, UNIQUE(restaurant_id, name) allows multiple rows with same name if restaurant_id is different.
-- If restaurant_id is NULL (global templates), standard SQL says (NULL, 'Size') != (NULL, 'Size'), 
-- but Postgres implementation of UNIQUE allows only one (NULL, 'Size') if we use a unique index where nulls not distinct? 
-- Actually default Postgres unique allows multiple nulls. 
-- BUT we want to treat NULL as "Global". We probably want only *one* Global "Size".
-- So we might need a partial index for the global ones, and a standard unique for the restaurant ones.

-- Let's check current constraints
ALTER TABLE variant_templates DROP CONSTRAINT IF EXISTS variant_templates_name_key;

-- Constraint for Restaurant-Specific Templates: (restaurant_id, name) must be unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_variant_templates_restaurant_name 
ON variant_templates(restaurant_id, name) 
WHERE restaurant_id IS NOT NULL;

-- Constraint for Global Templates: (name) must be unique where restaurant_id is null
CREATE UNIQUE INDEX IF NOT EXISTS idx_variant_templates_global_name 
ON variant_templates(name) 
WHERE restaurant_id IS NULL;

-- 4. RLS Policies
-- Enable RLS
ALTER TABLE variant_templates ENABLE ROW LEVEL SECURITY;

-- Allow reading Global templates (restaurant_id IS NULL) OR templates for own restaurant
-- Allow reading Global templates (restaurant_id IS NULL) OR templates for own restaurant
DROP POLICY IF EXISTS "View global and own variant templates" ON variant_templates;
CREATE POLICY "View global and own variant templates" ON variant_templates
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

-- Allow creating/updating/deleting OWN variant templates
DROP POLICY IF EXISTS "Manage own variant templates" ON variant_templates;
CREATE POLICY "Manage own variant templates" ON variant_templates
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
