CREATE OR REPLACE FUNCTION public.handle_new_customer_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.customers (user_id, phone, email, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.phone, ''),              -- phone OTP recommended so NEW.phone is present
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NULL)
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_customer ON auth.users;

CREATE TRIGGER on_auth_user_created_customer
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_customer_user();
