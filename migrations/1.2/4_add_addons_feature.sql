-- ================================================================
-- ADDONS / UPSELLS FEATURE (Consolidated)
-- ================================================================

-- Link Table: Link a parent menu item to other menu items (upsells/add-ons)
CREATE TABLE IF NOT EXISTS menu_item_upsells (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  upsell_menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(parent_menu_item_id, upsell_menu_item_id)
);

-- RLS
ALTER TABLE menu_item_upsells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read menu_item_upsells" ON menu_item_upsells FOR SELECT USING (true);
CREATE POLICY "Owner manage menu_item_upsells" ON menu_item_upsells FOR ALL USING (auth.role() = 'authenticated');

-- View to easily fetch upsells for items
CREATE OR REPLACE VIEW menu_items_with_upsells AS
SELECT 
  mi.id as menu_item_id,
  COALESCE(
    json_agg(
      json_build_object(
        'id', u_item.id,
        'name', u_item.name,
        'price', u_item.price,
        'veg', u_item.veg,
        'status', u_item.status,
        'image_url', u_item.image_url
      ) ORDER BY miu.display_order
    ) FILTER (WHERE u_item.id IS NOT NULL),
    '[]'::json
  ) as upsells
FROM menu_items mi
LEFT JOIN menu_item_upsells miu ON mi.id = miu.parent_menu_item_id AND miu.is_active = true
LEFT JOIN menu_items u_item ON miu.upsell_menu_item_id = u_item.id
WHERE (u_item.status = 'available' OR u_item.status IS NULL)
GROUP BY mi.id;
