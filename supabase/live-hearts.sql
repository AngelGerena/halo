-- HALO — live hearts: let the big screen hear about new hearts the moment they happen.
-- Idempotent: adding a table already in the publication errors harmlessly, so guard it.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'reactions'
  ) then
    alter publication supabase_realtime add table reactions;
  end if;
end $$;
