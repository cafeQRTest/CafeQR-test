-- Enable PostGIS
create extension if not exists postgis;

-- Add location + delivery radius
alter table public.restaurant_profiles
  add column if not exists location geography(Point, 4326),
  add column if not exists delivery_radius_km integer not null default 10;

-- Index for fast distance queries
create index if not exists restaurant_profiles_location_gix
  on public.restaurant_profiles using gist (location);
