-- Read email from JWT
CREATE OR REPLACE FUNCTION public.current_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT auth.jwt() ->> 'email';
$$;

-- Owner/staff membership check
CREATE OR REPLACE FUNCTION public.is_restaurant_member(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = rid AND r.owner_email = public.current_email()
  )
  OR EXISTS (
    SELECT 1 FROM public.restaurant_staff s
    WHERE s.restaurant_id = rid AND s.staff_email = public.current_email()
  );
$$;
