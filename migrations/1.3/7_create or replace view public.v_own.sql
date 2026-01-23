create or replace view public.v_owner_customers as
select
  rc.restaurant_id,
  rc.customer_id,
  c.name,
  c.phone,
  rc.first_order_at,
  rc.last_order_at,
  rc.order_count,
  rc.total_spent,
  rc.visit_count,
  rc.loyalty_points
from public.restaurant_customers rc
join public.customers c on c.id = rc.customer_id;
