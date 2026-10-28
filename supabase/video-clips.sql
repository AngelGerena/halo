-- HALO — short video clips. A clip is a normal photos row whose storage_path
-- is a still frame (so every grid, email and thumbnail keeps working) and whose
-- video_path points at the clip itself. Additive + idempotent.
alter table photos add column if not exists video_path text;
alter table photos add column if not exists duration real;
