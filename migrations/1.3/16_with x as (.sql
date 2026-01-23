with x as (
  select
    o.restaurant_id,
    o.customer_id,
    count(distinct (coalesce(o.date_ordered, o.created_at)::date)) as visits,
    count(*) as orders_cnt,
    sum(coalesce(o.total_inc_tax, o.total_amount, o.total, 0)) as spent,
    max(coalesce(o.date_ordered, o.created_at)::date) as last_visit
  from public.orders o
  where o.customer_id is not null
    and o.status <> 'cancelled'
  group by o.restaurant_id, o.customer_id
)
update public.restaurant_customers rc
set
  visit_count = x.visits,
  order_count = x.orders_cnt,
  total_spent = x.spent,
  last_visit_date = x.last_visit,
  updated_at = now()
from x
where rc.restaurant_id = x.restaurant_id
  and rc.customer_id = x.customer_id;
