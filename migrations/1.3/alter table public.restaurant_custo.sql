alter table public.restaurant_customers
  add column if not exists visit_count int not null default 0,
  add column if not exists last_visit_date date,
  add column if not exists loyalty_points int not null default 0,
  add column if not exists total_points_earned int not null default 0,
  add column if not exists total_points_redeemed int not null default 0;
