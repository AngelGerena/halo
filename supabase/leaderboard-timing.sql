-- How often the live wall shows "Top photographers tonight".
-- null = default (every 10 minutes), 0 = off, otherwise 5, 10 or 20 minutes.
alter table public.events add column if not exists leaderboard_minutes int;
notify pgrst, 'reload schema';
