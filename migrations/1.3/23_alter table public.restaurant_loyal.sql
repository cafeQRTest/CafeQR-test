alter table public.restaurant_loyalty_settings
add column if not exists points_expiry_days int;
