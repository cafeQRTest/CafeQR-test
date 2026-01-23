create or replace function public.get_loyalty_settings(p_restaurant_id uuid)
returns public.restaurant_loyalty_settings
language sql
security definer
as $$
  select *
  from public.restaurant_loyalty_settings
  where restaurant_id = p_restaurant_id
$$;
