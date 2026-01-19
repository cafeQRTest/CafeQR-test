create or replace view public.v_restaurant_customers as
select
  o.restaurant_id,
  -- Use whatever field you store phone in:
  o.customer_phone as phone,
  max(nullif(o.customer_name, '')) as name,

  min(coalesce(o.date_ordered, o.created_at)) as first_order_at,
  max(coalesce(o.date_ordered, o.created_at)) as last_order_at,

  count(*) filter (where o.status <> 'cancelled') as order_count,

  -- “Visits” = distinct days the customer placed an order
  count(distinct (coalesce(o.date_ordered, o.created_at)::date))
    filter (where o.status <> 'cancelled') as visit_count,

  sum(coalesce(o.total_inc_tax, o.total_amount, 0))
    filter (where o.status <> 'cancelled') as total_spent

from public.orders o
where o.customer_phone is not null and o.customer_phone <> ''
group by o.restaurant_id, o.customer_phone;
