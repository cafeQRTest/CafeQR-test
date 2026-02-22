-- Migration to add 'takeaway' to order_type constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check CHECK (order_type IN ('counter', 'parcel', 'dine-in', 'delivery', 'takeaway'));
