begin;

  -- 1. Enable RLS on the table if not already enabled
  alter table if exists "alert_notification" enable row level security;

  -- 2. Drop existing policy to avoid naming conflicts
  drop policy if exists "Enable read access for authenticated users" on "alert_notification";

  -- 3. Create a policy allowing authenticated users (owners/staff) to read alerts.
  -- This is required for Supabase Realtime to push events to the client.
  -- The client-side subscription filters by restaurant_id, and this policy allows the select.
  create policy "Enable read access for authenticated users"
    on "alert_notification"
    for select
    to authenticated
    using (true);

  -- 4. Ensure the table is part of the supabase_realtime publication
  do $$
  begin
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'alert_notification'
    ) then
      alter publication supabase_realtime add table "alert_notification";
    end if;
  end $$;

commit;
