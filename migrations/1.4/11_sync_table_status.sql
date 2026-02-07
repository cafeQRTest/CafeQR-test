-- Migration: Sync Table Status with Orders
-- Version: 1.4.11
-- updates table status to 'occupied' when order created with table number
-- updates table status to 'available' when order completed

CREATE OR REPLACE FUNCTION sync_table_status_from_order()
RETURNS TRIGGER AS $$
BEGIN
    -- Handle INSERT (New Order)
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.table_number IS NOT NULL AND NEW.status <> 'completed') THEN
            -- Attempt to find and update table. 
            -- We match on 'identifier' which is the column used by frontend.
            UPDATE tables 
            SET status = 'occupied', 
                current_order_id = NEW.id,
                updated_at = NOW()
            WHERE restaurant_id = NEW.restaurant_id 
            AND identifier = NEW.table_number; -- Assuming column is 'identifier'
        END IF;
        
    -- Handle UPDATE (Order Status Change or Table Change)
    ELSIF (TG_OP = 'UPDATE') THEN
        
        -- CASE 1: Table Number Changed (Swap Tables)
        IF (OLD.table_number IS DISTINCT FROM NEW.table_number) THEN
             -- A. Release the OLD table (if it exists and was held by this order)
             IF (OLD.table_number IS NOT NULL) THEN
                 UPDATE tables 
                 SET status = 'available', 
                     current_order_id = NULL,
                     updated_at = NOW()
                 WHERE restaurant_id = NEW.restaurant_id 
                 AND identifier = OLD.table_number -- 'identifier' per frontend code
                 AND current_order_id = NEW.id; -- Only release if WE were the one holding it
             END IF;

             -- B. Occupy the NEW table (if valid and order is active)
             IF (NEW.table_number IS NOT NULL AND NEW.status NOT IN ('completed', 'cancelled')) THEN
                 UPDATE tables 
                 SET status = 'occupied', 
                     current_order_id = NEW.id, 
                     updated_at = NOW()
                 WHERE restaurant_id = NEW.restaurant_id 
                 AND identifier = NEW.table_number;
             END IF;
        END IF;

        -- CASE 2: Order Status Changed (Complete/Cancel)
        -- Only if table hasn't just changed (avoid double update if both changed, though safe due to ID check)
        IF (NEW.status IN ('completed', 'cancelled', 'void') AND OLD.status NOT IN ('completed', 'cancelled', 'void')) THEN
            UPDATE tables 
            SET status = 'available', 
                current_order_id = NULL,
                updated_at = NOW()
            WHERE current_order_id = NEW.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-create trigger safely
DROP TRIGGER IF EXISTS trigger_sync_table_status_orders ON orders;

CREATE TRIGGER trigger_sync_table_status_orders
    AFTER INSERT OR UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION sync_table_status_from_order();
