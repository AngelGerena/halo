-- HALO: photo frames (safe to run more than once).
-- One frame per event, applied to photos guests save or share. Off (null) by default.
alter table public.events add column if not exists frame_style text;         -- keepsake | gold | arch | party | sponsor | null
alter table public.events add column if not exists frame_logo text;          -- fm | mono | none
alter table public.events add column if not exists frame_title text;         -- names shown on the frame (blank = event name)
alter table public.events add column if not exists frame_partner_path text;  -- partner logo for the sponsor frame
notify pgrst, 'reload schema';
