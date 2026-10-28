-- HALO — co-hosts. The event owner invites people by email (a planner,
-- family member, church media team). Once they sign in with that email they
-- can run the event: moderate, put it on the TV, download. Only the owner
-- can delete the event or change co-hosts. Accessed only through Netlify
-- functions (service role), so RLS is on with no public policies.
create table if not exists event_cohosts (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  email      text not null,
  invited_by uuid,
  created_at timestamptz not null default now(),
  unique (event_id, email)
);
create index if not exists idx_cohosts_email on event_cohosts(lower(email));
alter table event_cohosts enable row level security;
