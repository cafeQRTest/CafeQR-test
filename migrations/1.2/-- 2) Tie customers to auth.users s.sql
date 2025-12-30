-- 2) Tie customers to auth.users so login/session maps to exactly one customer profile
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE;

ALTER TABLE public.customers
ADD CONSTRAINT customers_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id)
ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS customers_user_id_idx ON public.customers(user_id);
