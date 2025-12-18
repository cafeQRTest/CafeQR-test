ALTER TABLE public.variant_options
ADD CONSTRAINT variant_options_template_id_name_key UNIQUE (template_id, name);
