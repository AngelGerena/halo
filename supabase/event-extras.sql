-- HALO: event extras (safe to run more than once).
-- Every extra is OFF by default; the host turns each one on per event in
-- Manage > Event settings > Extras.
alter table public.events add column if not exists boomerang_enabled boolean not null default false;
alter table public.events add column if not exists video_guestbook_enabled boolean not null default false;
alter table public.events add column if not exists filters_enabled boolean not null default false;
alter table public.events add column if not exists mosaic_enabled boolean not null default false;
alter table public.events add column if not exists lead_capture text not null default 'off';   -- off | email | phone | both
alter table public.events add column if not exists lead_consent_text text;                     -- optional custom consent line
alter table public.events add column if not exists sponsor_name text;                          -- shown with the sponsor logo (frame_partner_path)

-- What a photos row is: a normal photo, a boomerang loop, or a video guestbook message.
alter table public.photos add column if not exists kind text not null default 'photo';         -- photo | boomerang | message
alter table public.photos add column if not exists filter text;                                -- filter applied before upload, if any
alter table public.photos add column if not exists loop_frames int;                            -- boomerang: frames in the sprite sheet

-- Lead capture (corporate events). Not readable from the browser: the
-- privacy grants on contributors list columns explicitly, and these are not in it.
alter table public.contributors add column if not exists phone text;
alter table public.contributors add column if not exists marketing_ok boolean not null default false;

notify pgrst, 'reload schema';
