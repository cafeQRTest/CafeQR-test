CREATE POLICY "orders_update_staff_restaurant"
ON "public"."orders"
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM restaurant_staff rs
    WHERE rs.restaurant_id = orders.restaurant_id
    AND rs.staff_email = (SELECT private.current_email())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM restaurant_staff rs
    WHERE rs.restaurant_id = orders.restaurant_id
    AND rs.staff_email = (SELECT private.current_email())
  )
);