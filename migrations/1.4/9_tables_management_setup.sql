-- Migration: Table Management System
-- Creates comprehensive table management schema for restaurant seating
-- Version: 1.4.9

-- Create tables table for individual table management
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    table_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(restaurant_id, table_number)
);

-- Add columns if they don't exist (for existing tables)
DO $$ 
BEGIN
    -- Table Properties
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='capacity') THEN
        ALTER TABLE tables ADD COLUMN capacity INTEGER DEFAULT 4;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='section') THEN
        ALTER TABLE tables ADD COLUMN section TEXT DEFAULT 'Main';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='floor_level') THEN
        ALTER TABLE tables ADD COLUMN floor_level TEXT DEFAULT 'Ground Floor';
    END IF;
    
    -- Status Management
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='status') THEN
        ALTER TABLE tables ADD COLUMN status TEXT DEFAULT 'available';
        ALTER TABLE tables ADD CONSTRAINT tables_status_check CHECK (status IN ('available', 'occupied', 'reserved', 'cleaning', 'maintenance'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='reservation_name') THEN
        ALTER TABLE tables ADD COLUMN reservation_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='reservation_phone') THEN
        ALTER TABLE tables ADD COLUMN reservation_phone TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='reservation_time') THEN
        ALTER TABLE tables ADD COLUMN reservation_time TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Order Integration
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='current_order_id') THEN
        ALTER TABLE tables ADD COLUMN current_order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
    END IF;
    
    -- QR Code Integration
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='qr_code_url') THEN
        ALTER TABLE tables ADD COLUMN qr_code_url TEXT;
    END IF;
    
    -- Visual Positioning
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='position_x') THEN
        ALTER TABLE tables ADD COLUMN position_x INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='position_y') THEN
        ALTER TABLE tables ADD COLUMN position_y INTEGER DEFAULT 0;
    END IF;
    
    -- Table Configuration
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='is_active') THEN
        ALTER TABLE tables ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='allow_online_reservation') THEN
        ALTER TABLE tables ADD COLUMN allow_online_reservation BOOLEAN DEFAULT TRUE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='min_reservation_duration_minutes') THEN
        ALTER TABLE tables ADD COLUMN min_reservation_duration_minutes INTEGER DEFAULT 60;
    END IF;
    
    -- Additional Info
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='notes') THEN
        ALTER TABLE tables ADD COLUMN notes TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tables' AND column_name='shape') THEN
        ALTER TABLE tables ADD COLUMN shape TEXT DEFAULT 'rectangle';
        ALTER TABLE tables ADD CONSTRAINT tables_shape_check CHECK (shape IN ('rectangle', 'circle', 'square'));
    END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_status ON tables(restaurant_id, status) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_tables_section ON tables(restaurant_id, section) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_tables_floor ON tables(restaurant_id, floor_level) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_tables_current_order ON tables(current_order_id) WHERE current_order_id IS NOT NULL;

-- Create table_sections for organizing tables into areas
CREATE TABLE IF NOT EXISTS table_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    section_name TEXT NOT NULL,
    description TEXT,
    color_code TEXT DEFAULT '#6366f1',
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(restaurant_id, section_name)
);

CREATE INDEX IF NOT EXISTS idx_table_sections_restaurant ON table_sections(restaurant_id);

-- Create default sections for each restaurant
INSERT INTO table_sections (restaurant_id, section_name, description, color_code, display_order)
SELECT 
    id as restaurant_id,
    'Main' as section_name,
    'Main dining area' as description,
    '#6366f1' as color_code,
    1 as display_order
FROM restaurants
WHERE NOT EXISTS (
    SELECT 1 FROM table_sections ts WHERE ts.restaurant_id = restaurants.id
);

-- Create table_history for tracking status changes
CREATE TABLE IF NOT EXISTS table_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    
    -- Change Details
    old_status TEXT,
    new_status TEXT,
    changed_by_user_id UUID,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Associated Order
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    
    -- Notes
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_table_history_table ON table_history(table_id);
CREATE INDEX IF NOT EXISTS idx_table_history_restaurant ON table_history(restaurant_id, changed_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tables_updated_at_trigger
    BEFORE UPDATE ON tables
    FOR EACH ROW
    EXECUTE FUNCTION update_tables_updated_at();

-- Trigger to log table status changes
CREATE OR REPLACE FUNCTION log_table_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO table_history (
            table_id,
            restaurant_id,
            old_status,
            new_status,
            order_id
        ) VALUES (
            NEW.id,
            NEW.restaurant_id,
            OLD.status,
            NEW.status,
            NEW.current_order_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER table_status_change_trigger
    AFTER UPDATE ON tables
    FOR EACH ROW
    EXECUTE FUNCTION log_table_status_change();

-- RLS Policies
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_history ENABLE ROW LEVEL SECURITY;

-- Policy: Restaurant owners can manage their tables
CREATE POLICY tables_restaurant_owner_policy ON tables
    FOR ALL
    USING (
        restaurant_id IN (
            SELECT id FROM restaurants WHERE owner_email = auth.jwt() ->> 'email'
        )
    );

CREATE POLICY table_sections_restaurant_owner_policy ON table_sections
    FOR ALL
    USING (
        restaurant_id IN (
            SELECT id FROM restaurants WHERE owner_email = auth.jwt() ->> 'email'
        )
    );

CREATE POLICY table_history_restaurant_owner_policy ON table_history
    FOR SELECT
    USING (
        restaurant_id IN (
            SELECT id FROM restaurants WHERE owner_email = auth.jwt() ->> 'email'
        )
    );

-- Grants
GRANT ALL ON tables TO authenticated;
GRANT ALL ON table_sections TO authenticated;
GRANT SELECT ON table_history TO authenticated;

COMMENT ON TABLE tables IS 'Individual restaurant tables with seating capacity, status, and positioning';
COMMENT ON TABLE table_sections IS 'Organizational sections/areas for grouping tables';
COMMENT ON TABLE table_history IS 'Audit log of table status changes';
