-- Optional: case-insensitive uniqueness on item name per restaurant [web:375]
create extension if not exists citext;

alter table public.menu_items
  alter column name type citext;

create unique index if not exists menu_items_unique_restaurant_name
  on public.menu_items (restaurant_id, name);
