create unique index if not exists menu_items_unique_restaurant_normname
on public.menu_items (restaurant_id, lower(trim(name)));
