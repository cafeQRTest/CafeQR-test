-- 8_add_delivery_hours.sql
--
-- Create delivery_hours table (mirrors restaurant_hours but for delivery orders)
-- and add delivery_paused column to restaurants.

-- 1. delivery_hours table
CREATE TABLE IF NOT EXISTS public.delivery_hours (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  dow         integer NOT NULL CHECK (dow BETWEEN 1 AND 7),
  open_time   time NOT NULL DEFAULT '10:00',
  close_time  time NOT NULL DEFAULT '22:00',
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (restaurant_id, dow)
);

-- 2. Add delivery_paused to restaurants
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS delivery_paused boolean DEFAULT false;

-- 3. RLS
ALTER TABLE public.delivery_hours ENABLE ROW LEVEL SECURITY;

-- Owners can manage their own delivery hours
CREATE POLICY "Owners manage own delivery_hours"
  ON public.delivery_hours
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
    )
  );

-- Public read (needed for customer-facing pages to check hours)
CREATE POLICY "Public read delivery_hours"
  ON public.delivery_hours
  FOR SELECT
  USING (true);

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
