-- ================================================================
-- MENU IMAGES MIGRATION - FINAL VERSION
-- ================================================================
-- This migration ensures menu item images work correctly
-- Images are stored as compressed WebP/JPEG Base64 strings
-- File size: ~6-15KB per image (colorful, good quality)
-- ================================================================

-- 1. Ensure image_url column can handle large Base64 strings
ALTER TABLE menu_items 
ALTER COLUMN image_url TYPE TEXT;

-- 2. Clean up old Supabase Storage bucket URLs (optional)
-- Run this if you have old bucket URLs that are broken
UPDATE menu_items
SET image_url = NULL
WHERE image_url IS NOT NULL 
  AND image_url LIKE 'https://%';

-- 3. Verify the column is ready
SELECT 
  column_name,
  data_type,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'menu_items' 
  AND column_name = 'image_url';

-- ================================================================
-- HOW IT WORKS:
-- ================================================================
-- - Upload: ItemEditor compresses images to WebP (45% quality) or JPEG (50%)
-- - Size: Images resized to 250px max dimension
-- - Storage: Stored as Base64 data URL in image_url column
-- - Display: MenuItemCard shows images directly from Base64
-- - Height: Fixed 140px height for compact, elegant appearance
-- 
-- Example Base64 format:
-- data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoB...
-- 
-- Typical sizes:
-- - Small image (200x150): ~6KB
-- - Medium image (250x200): ~10KB
-- - Large image (250x250): ~15KB
-- ================================================================
