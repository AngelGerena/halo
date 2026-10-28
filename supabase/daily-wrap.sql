-- HALO — morning-after host email: remember which events already got it.
alter table events add column if not exists wrap_sent_at timestamptz;
