-- HALO: real music library + saved highlight videos. Safe to run more than once.

-- Music library: who made the track, how long it is, where it came from.
alter table public.music_library add column if not exists artist text;
alter table public.music_library add column if not exists duration integer;
alter table public.music_library add column if not exists external_id text;
alter table public.music_library add column if not exists source_url text;
create unique index if not exists music_library_external_id on public.music_library (external_id) where external_id is not null;

-- Guests and hosts only ever see active tracks.
drop policy if exists "read music" on public.music_library;
create policy "read music" on public.music_library for select using (active = true);

-- Highlight videos saved to the event:
-- [{ "id", "path", "type", "seconds", "vertical", "music", "created_at" }]
alter table public.events add column if not exists highlights jsonb not null default '[]'::jsonb;

-- The old built-in placeholder tracks (/music/*.mp3) are gone: events that
-- pointed at one go back to Auto, which now uses the real library.
update public.events set music_url = null where music_url like '/music/%';
