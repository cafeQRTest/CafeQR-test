update invoices i
set mixed_payment_details = o.mixed_payment_details,
    payment_method = coalesce(i.payment_method, o.payment_method)
from orders o
where i.order_id = o.id
  and i.restaurant_id = o.restaurant_id
  and i.mixed_payment_details is null
  and o.mixed_payment_details is not null;
