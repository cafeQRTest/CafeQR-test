create or replace function public.normalize_phone(p text)
returns text
language plpgsql
immutable
as $$
declare d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '\D', '', 'g');
  if d = '' then return null; end if;

  -- Keep last 10 digits (works well for India numbers; remove if you support other formats)
  if length(d) > 10 then
    d := right(d, 10);
  end if;

  return d;
end $$;
s