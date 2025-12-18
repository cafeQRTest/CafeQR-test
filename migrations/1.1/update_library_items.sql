-- Add variant and image support to menu library items
ALTER TABLE menu_library_items ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT false;
ALTER TABLE menu_library_items ADD COLUMN IF NOT EXISTS image_url TEXT;
