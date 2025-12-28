ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_select_own ON public.customers;
CREATE POLICY customers_select_own
ON public.customers
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS customers_update_own ON public.customers;
CREATE POLICY customers_update_own
ON public.customers
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
