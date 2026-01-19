drop trigger if exists orders_sync_customer_stats on public.orders;

create trigger orders_sync_customer_stats
after insert on public.orders
for each row
execute function public.trg_orders_sync_customer_stats();

