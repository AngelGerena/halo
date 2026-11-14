-- HALO: several sponsors per event, with a wall layout the host picks.
--   sponsors              list of { id, name, tier, logo_path, message, moment }
--                         tier: presenting | gold | community
--                         moment (Sponsored moments): spot | board | mosaic | messages
--   sponsor_layout        corner | ticker | ribbon | breaks | lower | rail | split | marquee
--   sponsor_card_minutes  how often the sponsors card / sponsor break shows: 5, 10, 20, 0 = off (null = 10)
--   sponsor_moments       give Shot of the night, the leaderboard, the mosaic and video messages their own sponsors
alter table public.events add column if not exists sponsors jsonb not null default '[]'::jsonb;
alter table public.events add column if not exists sponsor_layout text;
alter table public.events add column if not exists sponsor_card_minutes int;
alter table public.events add column if not exists sponsor_moments boolean not null default false;
notify pgrst, 'reload schema';
