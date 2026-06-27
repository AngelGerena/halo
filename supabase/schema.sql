-- ============================================================
-- HALO — Database Schema (Supabase / Postgres)
-- Run in Supabase SQL Editor. Safe to re-run (idempotent-ish).
-- ============================================================

-- EVENTS: each church event the admin creates and names
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,              -- short code in the QR/URL, e.g. ICGG-RES26
  name        text not null,                     -- "Resurrection Sunday Service"
  host        text,                              -- "Iglesia Cristiana Gracia y Gloria"
  event_date  text,                              -- free text date for display
  keep_threshold int not null default 45,        -- quality cutoff for auto-curation
  is_active   boolean not null default true,
  published_at timestamptz,                       -- set when admin publishes the gallery
  created_at  timestamptz not null default now()
);

-- CONTRIBUTORS: a person who scanned the QR and named themselves (per event)
create table if not exists contributors (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  name        text not null,
  email       text,
  created_at  timestamptz not null default now()
);

-- PHOTOS: every upload, with quality scoring + storage pointer
create table if not exists photos (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  contributor_id uuid not null references contributors(id) on delete cascade,
  storage_path  text not null,                   -- path within the 'halo' bucket
  edited_path   text,                            -- Phase 3: auto-edited copy
  quality       int,                             -- 0..100 composite
  focus         int,                             -- sharpness proxy
  exposure      int,                             -- exposure balance proxy
  kept          boolean not null default true,   -- above threshold?
  width         int,
  height        int,
  created_at    timestamptz not null default now()
);

create index if not exists idx_photos_event on photos(event_id);
create index if not exists idx_photos_contributor on photos(contributor_id);
create index if not exists idx_contributors_event on contributors(event_id);

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
insert into storage.buckets (id, name, public)
values ('halo', 'halo', true)
on conflict (id) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- Frontend uses the ANON key (read public galleries + create
-- contributors/photos). All admin actions (create event, delete,
-- export) go through Netlify Functions using the SERVICE ROLE key,
-- which bypasses RLS — so admin power never touches the browser.
-- ============================================================
alter table events       enable row level security;
alter table contributors enable row level security;
alter table photos       enable row level security;

-- Anyone can read active events (needed to render the public event page)
drop policy if exists "read active events" on events;
create policy "read active events" on events
  for select using (is_active = true);

-- Anyone can read contributors + photos (public shareable galleries)
drop policy if exists "read contributors" on contributors;
create policy "read contributors" on contributors
  for select using (true);

drop policy if exists "read photos" on photos;
create policy "read photos" on photos
  for select using (true);

-- Anyone (scanning the QR) can register themselves as a contributor
drop policy if exists "create contributor" on contributors;
create policy "create contributor" on contributors
  for insert with check (true);

-- Anyone can insert a photo row (the upload flow). Tightened by app logic.
drop policy if exists "create photo" on photos;
create policy "create photo" on photos
  for insert with check (true);

-- Public storage read; uploads allowed to the 'halo' bucket
drop policy if exists "halo public read" on storage.objects;
create policy "halo public read" on storage.objects
  for select using (bucket_id = 'halo');

drop policy if exists "halo upload" on storage.objects;
create policy "halo upload" on storage.objects
  for insert with check (bucket_id = 'halo');

-- ============================================================
-- MIGRATION (run if upgrading an existing install)
-- ============================================================
alter table contributors add column if not exists email text;
alter table events add column if not exists published_at timestamptz;
