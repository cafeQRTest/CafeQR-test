create or replace function public.upsert_loyalty_settings(
  p_restaurant_id uuid,
  p_enabled boolean,
  p_points_per_rupee numeric,
  p_min_order_value numeric,
  p_redeem_threshold int,
  p_redeem_discount_type text,
  p_redeem_discount_value numeric,
  p_max_discount numeric,
  p_points_expiry_days int
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.restaurant_loyalty_settings (
    restaurant_id, enabled,
    points_per_rupee, min_order_value,
    redeem_threshold, redeem_discount_type, redeem_discount_value, max_discount,
    points_expiry_days,
    updated_at
  )
  values (
    p_restaurant_id, coalesce(p_enabled, false),
    greatest(coalesce(p_points_per_rupee, 0), 0), greatest(coalesce(p_min_order_value, 0), 0),
    greatest(coalesce(p_redeem_threshold, 0), 0), p_redeem_discount_type, greatest(coalesce(p_redeem_discount_value, 0), 0), greatest(coalesce(p_max_discount, 0), 0),
    case when p_points_expiry_days is null then null else greatest(p_points_expiry_days, 1) end,
    now()
  )
  on conflict (restaurant_id) do update set
    enabled = excluded.enabled,
    points_per_rupee = excluded.points_per_rupee,
    min_order_value = excluded.min_order_value,
    redeem_threshold = excluded.redeem_threshold,
    redeem_discount_type = excluded.redeem_discount_type,
    redeem_discount_value = excluded.redeem_discount_value,
    max_discount = excluded.max_discount,
    points_expiry_days = excluded.points_expiry_days,
    updated_at = now();
end $$;
