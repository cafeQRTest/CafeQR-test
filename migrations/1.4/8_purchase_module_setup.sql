 -- Purchase Module Migration
-- 1. Vendors Table
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  org_id UUID, -- Optional, for future use if needed
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Purchases Table
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  org_id UUID,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  invoice_number TEXT,
  purchase_date DATE DEFAULT CURRENT_DATE,
  total_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'received', -- 'received', 'draft'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Purchase Items Table
CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE, -- Denormalized for RLS ease
  org_id UUID,
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  expiry_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Update Ingredients Table (Cost Tracking)
ALTER TABLE ingredients 
ADD COLUMN IF NOT EXISTS avg_cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_purchase_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS org_id UUID;


-- 5. Update Restaurant Profiles (Settings Toggle)
ALTER TABLE restaurant_profiles
ADD COLUMN IF NOT EXISTS enable_purchase_management BOOLEAN DEFAULT FALSE;


-- 6. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_vendors_restaurant ON vendors(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_purchases_restaurant ON purchases(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_purchases_vendor ON purchases(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_ingredient ON purchase_items(ingredient_id);

-- 7. Enable RLS (Row Level Security)
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;

-- 8. Policies (Generic for restaurant owners/staff)
-- Vendors
CREATE POLICY "Users can manage their restaurant vendors" 
ON vendors FOR ALL 
USING (
  restaurant_id IN (
    SELECT id FROM restaurants WHERE owner_email = auth.email()
  ) 
  OR 
  restaurant_id IN (
     SELECT restaurant_id FROM restaurant_staff WHERE staff_email = auth.email()
  )
);

-- Purchases
CREATE POLICY "Users can manage their restaurant purchases" 
ON purchases FOR ALL 
USING (
  restaurant_id IN (
    SELECT id FROM restaurants WHERE owner_email = auth.email()
  ) 
  OR 
  restaurant_id IN (
     SELECT restaurant_id FROM restaurant_staff WHERE staff_email = auth.email()
  )
);

-- Purchase Items
CREATE POLICY "Users can manage their restaurant purchase items" 
ON purchase_items FOR ALL 
USING (
  restaurant_id IN (
    SELECT id FROM restaurants WHERE owner_email = auth.email()
  ) 
  OR 
  restaurant_id IN (
     SELECT restaurant_id FROM restaurant_staff WHERE staff_email = auth.email()
  )
);

-- 9. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE vendors;
ALTER PUBLICATION supabase_realtime ADD TABLE purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE ingredients; 
-- (ingredients likely already added, but safe to re-run)

SELECT 'Purchase Module Database Setup Completed' as status;
