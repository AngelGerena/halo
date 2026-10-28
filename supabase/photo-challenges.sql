-- HALO — photo challenges. null = the built-in list, [] = off, or the host's own list.
alter table events add column if not exists challenges jsonb;
alter table photos add column if not exists challenge text;
