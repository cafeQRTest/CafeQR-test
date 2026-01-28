-- Function to find restaurants within their specific delivery radius relative to a user's location
create or replace function get_restaurants_within_radius(user_lat float8, user_lng float8)
returns setof restaurant_profiles
language sql
stable
as $$
  select *
  from restaurant_profiles
  where (
    6371 * 2 * asin(sqrt(
      power(sin(radians((latitude - user_lat) / 2)), 2) +
      cos(radians(user_lat)) * cos(radians(latitude)) *
      power(sin(radians((longitude - user_lng) / 2)), 2)
    ))
  ) <= delivery_radius_km;
$$;
