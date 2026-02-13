-- Migration: Revert Table Management Features
-- Description: Safely removes management-specific columns and auxiliary tables 
--              while preserving the base 'tables' table and core identifiers.
-- Version: 1.4.13

BEGIN;

-- 1. Integration Triggers (Migration 11)
-- Reverts the automatic synchronization of table status with orders
DROP TRIGGER IF EXISTS trigger_sync_table_status_orders ON orders;
DROP FUNCTION IF EXISTS sync_table_status_from_order();

-- 2. Auxiliary Tables (Migrations 9 & 10)
-- Removes tracking history, floor levels, and custom sections
DROP TABLE IF EXISTS table_history CASCADE;
DROP TABLE IF EXISTS table_floors CASCADE;
DROP TABLE IF EXISTS table_sections CASCADE;

-- 3. Management Triggers & Functions (Migration 9)
-- Removes automatic timestamp and status logging triggers
DROP TRIGGER IF EXISTS tables_updated_at_trigger ON tables;
DROP TRIGGER IF EXISTS table_status_change_trigger ON tables;
DROP FUNCTION IF EXISTS public.update_tables_updated_at();
DROP FUNCTION IF EXISTS public.log_table_status_change();

-- 4. Revert 'tables' columns (Migration 9)
-- Keeps: id, restaurant_id, table_number (or identifier), created_at, updated_at
-- Removes: capacity, section, floor_level, status, and other advanced config
ALTER TABLE tables 
  DROP COLUMN IF EXISTS capacity,
  DROP COLUMN IF EXISTS section,
  DROP COLUMN IF EXISTS floor_level,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS reservation_name,
  DROP COLUMN IF EXISTS reservation_phone,
  DROP COLUMN IF EXISTS reservation_time,
  DROP COLUMN IF EXISTS current_order_id,
  DROP COLUMN IF EXISTS qr_code_url,
  DROP COLUMN IF EXISTS position_x,
  DROP COLUMN IF EXISTS position_y,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS allow_online_reservation,
  DROP COLUMN IF EXISTS min_reservation_duration_minutes,
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS shape;

-- 5. Configuration Columns (Migration 12)
-- Removes the restaurant-wide QR ordering feature flag
ALTER TABLE restaurant_profiles DROP COLUMN IF EXISTS qr_ordering_enabled;

COMMIT;
