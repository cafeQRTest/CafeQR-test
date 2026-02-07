-- Fix RLS policy for table_history to allow INSERTs from triggers
-- Version: 1.4.10

-- Drop restrictive SELECT-only policy
DROP POLICY IF EXISTS table_history_restaurant_owner_policy ON table_history;

-- Create comprehensive policy allowing INSERT/UPDATE/DELETE/SELECT for owners
CREATE POLICY table_history_restaurant_owner_policy ON table_history
    FOR ALL
    USING (
        restaurant_id IN (
            SELECT id FROM restaurants 
            WHERE owner_email = auth.jwt() ->> 'email'
            OR id IN (
                -- Also allow staff if they belong to the restaurant (future proofing)
                SELECT restaurant_id FROM restaurant_staff 
                WHERE staff_email = auth.jwt() ->> 'email'
            )
        )
    );

-- Ensure authenticated users (staff/owners) can actually perform the INSERT
GRANT ALL ON table_history TO authenticated;
