ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS addr_select_own ON public.customer_addresses;
CREATE POLICY addr_select_own
ON public.customer_addresses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS addr_insert_own ON public.customer_addresses;
CREATE POLICY addr_insert_own
ON public.customer_addresses
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS addr_update_own ON public.customer_addresses;
CREATE POLICY addr_update_own
ON public.customer_addresses
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS addr_delete_own ON public.customer_addresses;
CREATE POLICY addr_delete_own
ON public.customer_addresses
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.user_id = auth.uid()
  )
);
