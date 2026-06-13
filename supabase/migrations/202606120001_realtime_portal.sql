do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'portal_states'
  ) then
    alter publication supabase_realtime add table public.portal_states;
  end if;
end $$;
