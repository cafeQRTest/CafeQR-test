-- Enable RLS on order_items just in case
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Remove potentially conflicting or restrictive policies
DROP POLICY IF EXISTS "View order items" ON order_items;
DROP POLICY IF EXISTS "Enable read access for users based on orders" ON order_items;

-- Policy: Allow users to view order items if they can view the parent order
-- This relies on the RLS policy of the 'orders' table.
CREATE POLICY "Enable read access for users based on orders"
ON order_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_items.order_id
  )
);
