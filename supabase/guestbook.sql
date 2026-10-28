-- HALO — guestbook well-wishes. Short messages guests leave for the couple /
-- guest of honor. They show on the live wall and go into the host's keepsake.
create table if not exists wishes (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references events(id) on delete cascade,
  contributor_id uuid references contributors(id) on delete set null,
  name           text,
  message        text not null check (char_length(message) between 1 and 280),
  status         text not null default 'approved',   -- approved | pending | hidden
  created_at     timestamptz not null default now()
);
create index if not exists idx_wishes_event on wishes(event_id);

alter table wishes enable row level security;
drop policy if exists "read wishes" on wishes;
create policy "read wishes" on wishes for select using (status = 'approved');
drop policy if exists "create wish" on wishes;
create policy "create wish" on wishes for insert with check (status in ('approved', 'pending'));

-- new wishes reach the live wall instantly
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wishes') then
    alter publication supabase_realtime add table wishes;
  end if;
end $$;
