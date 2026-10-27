-- HALO — per-event look (one of the ten palette keys; null = site default).
alter table events add column if not exists look text;
