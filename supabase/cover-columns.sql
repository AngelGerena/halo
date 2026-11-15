-- Event cover photo columns. Already present on the live HALO database; kept
-- here so a fresh install matches what the app and update-event.js expect.
-- Safe to run more than once.
alter table public.events add column if not exists cover_path text;
alter table public.events add column if not exists cover_zoom real;
