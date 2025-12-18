with ranked as (
  select id,
         row_number() over (
           partition by restaurant_id, lower(trim(name))
           order by created_at desc nulls last, id desc
         ) as rn
  from public.menu_items
)
delete from public.menu_items m
using ranked r
where m.id = r.id
  and r.rn > 1;

create unique index if not exists menu_items_unique_restaurant_normname
on public.menu_items (restaurant_id, lower(trim(name)));
