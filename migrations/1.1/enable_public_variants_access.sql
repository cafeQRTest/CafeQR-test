-- Enable RLS and add public read policies for variant tables to ensure customers can see them

-- variant_templates
ALTER TABLE variant_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access" ON variant_templates;
CREATE POLICY "Public read access" ON variant_templates FOR SELECT USING (true);

-- variant_options
ALTER TABLE variant_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access" ON variant_options;
CREATE POLICY "Public read access" ON variant_options FOR SELECT USING (true);

-- menu_item_variants
ALTER TABLE menu_item_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access" ON menu_item_variants;
CREATE POLICY "Public read access" ON menu_item_variants FOR SELECT USING (true);

-- variant_pricing
ALTER TABLE variant_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access" ON variant_pricing;
CREATE POLICY "Public read access" ON variant_pricing FOR SELECT USING (true);
