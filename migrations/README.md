# Database Migrations

This folder contains SQL migration scripts for the CafeQR application.

## How to Use

1. **Open Supabase SQL Editor**
   - Go to your Supabase dashboard
   - Navigate to SQL Editor

2. **Run Migration Files**
   - Copy the content from the migration file
   - Paste into SQL Editor
   - Execute the script

3. **Verify Changes**
   - Check the output to ensure successful execution
   - Verify the changes in your database tables

## Migration Files

### `database_schema_menu_images.sql`
**Purpose**: Menu Item Images Feature  
**Date**: December 2025  
**Description**: 
- Ensures `image_url` column can store Base64 compressed images
- Cleans up old Supabase Storage bucket URLs
- Implements colorful WebP/JPEG image compression (6-15KB per image)

**Run this if:**
- You're enabling the menu images feature for the first time
- Images are not loading properly
- You have old bucket URLs that need cleanup

---

## Best Practices

✅ **Always backup your database before running migrations**  
✅ **Test migrations on a development database first**  
✅ **Read the migration file comments before executing**  
✅ **Check for any dependencies between migrations**  
✅ **Keep this README updated when adding new migrations**

## Migration Naming Convention

Format: `[description]_[feature].sql`

Examples:
- `database_schema_menu_images.sql`
- `add_column_orders_table.sql`
- `fix_foreign_keys_relationships.sql`

---

## Support

If you encounter issues with migrations, check:
1. Supabase logs for error details
2. Your table structure matches expectations
3. You have proper permissions to alter tables
