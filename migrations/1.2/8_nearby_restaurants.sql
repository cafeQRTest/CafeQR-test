create or replace function public.nearby_restaurants(
  in_lat double precision,
  in_lng double precision,
  in_radius_km integer default 10
)
returns table (
  restaurant_id uuid,
  name text,
  distance_km double precision
)
language sql
stable
as $$
  select
    r.id as restaurant_id,
    r.name,
    round( (st_distance(rp.location, st_makepoint(in_lng, in_lat)::geography) / 1000.0)::numeric, 2 )::double precision as distance_km
  from public.restaurants r
  join public.restaurant_profiles rp
    on rp.restaurant_id = r.id
  where rp.location is not null
    and st_dwithin(
      rp.location,
      st_makepoint(in_lng, in_lat)::geography,
      (in_radius_km * 1000)::double precision
    )
  order by st_distance(rp.location, st_makepoint(in_lng, in_lat)::geography) asc;
$$;
