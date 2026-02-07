-- Migration: Add Table Floors
-- Creates table_floors to manage floor levels for restaurants
-- Version: 1.4.10

CREATE TABLE IF NOT EXISTS table_floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    floor_name TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(restaurant_id, floor_name)
);

CREATE INDEX IF NOT EXISTS idx_table_floors_restaurant ON table_floors(restaurant_id);

-- RLS Policies
ALTER TABLE table_floors ENABLE ROW LEVEL SECURITY;

CREATE POLICY table_floors_restaurant_owner_policy ON table_floors
    FOR ALL
    USING (
        restaurant_id IN (
            SELECT id FROM restaurants WHERE owner_email = auth.jwt() ->> 'email'
        )
    );

GRANT ALL ON table_floors TO authenticated;

COMMENT ON TABLE table_floors IS 'Organizational floor levels for restaurant tables';
