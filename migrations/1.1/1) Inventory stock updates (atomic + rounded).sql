CREATE OR REPLACE FUNCTION public.apply_stock_adjustments(
  p_restaurant_id uuid,
  p_adjustments jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT
      (x->>'ingredient_id')::uuid AS ingredient_id,
      (x->>'delta')::numeric     AS delta
    FROM jsonb_array_elements(p_adjustments) x
  LOOP
    UPDATE public.ingredients
      SET current_stock = round((current_stock + rec.delta)::numeric, 2),
          updated_at = now()
    WHERE id = rec.ingredient_id
      AND restaurant_id = p_restaurant_id
      AND (current_stock + rec.delta) >= 0;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient stock or ingredient missing: %', rec.ingredient_id;
    END IF;
  END LOOP;
END;
$$;
