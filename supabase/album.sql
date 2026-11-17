-- HALO Album: what co-hosts get after the event.
--   auto  (default) co-hosts keep the host tools during the event and get the
--         simple, view-only Album the day after the event date
--   album the host switched co-hosts to the Album now
--   tools the host lets co-hosts keep the full tools
-- The album link itself needs no table: it is a signed key made from the event id.
alter table public.events add column if not exists cohost_mode text not null default 'auto';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'events_cohost_mode_check') then
    alter table public.events add constraint events_cohost_mode_check check (cohost_mode in ('auto', 'album', 'tools'));
  end if;
end $$;
notify pgrst, 'reload schema';
