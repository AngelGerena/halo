-- ============================================================
-- HALO — Database Schema (Supabase / Postgres)
-- Run in Supabase SQL Editor. Safe to re-run (idempotent-ish).
-- ============================================================

-- EVENTS: each church event the admin creates and names
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,              -- short code in the QR/URL, e.g. ICGG-RES26
  name        text not null,                     -- "Resurrection Sunday Service"
  name_es     text,                              -- Spanish event name (auto-suggested, admin-editable)
  host        text,                              -- "Iglesia Cristiana Gracia y Gloria"
  host_es     text,                              -- Spanish host
  event_date  text,                              -- free text date for display
  event_date_es text,                            -- Spanish date
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
alter table events add column if not exists name_es text;
alter table events add column if not exists host_es text;
alter table events add column if not exists event_date_es text;

-- ============================================================
-- HALO V2 — Phase 1: moderation gate + consent-first child safety
-- Additive + idempotent. Existing rows default to current behavior
-- (photos 'approved', events moderation 'off') so nothing breaks.
-- ============================================================
alter table photos add column if not exists status text not null default 'approved';   -- approved | pending | hidden
alter table photos add column if not exists has_minors boolean not null default false;  -- contributor flagged children in frame
alter table events add column if not exists moderation_mode text not null default 'off'; -- off | review
alter table events add column if not exists protect_minors boolean not null default true;-- hold child-flagged photos for review
create index if not exists idx_photos_status on photos(status);

-- ============================================================
-- HALO V2 — Phase 2: engagement (reactions, moment, recurring QR, connect CTA)
-- Additive + idempotent.
-- ============================================================
-- Reactions (hearts). One per device per photo (enforced by unique constraint).
create table if not exists reactions (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references photos(id) on delete cascade,
  event_id    uuid not null references events(id) on delete cascade,
  device_id   text not null,
  created_at  timestamptz not null default now(),
  unique (photo_id, device_id)
);
create index if not exists idx_reactions_event on reactions(event_id);
create index if not exists idx_reactions_photo on reactions(photo_id);

alter table reactions enable row level security;
drop policy if exists "read reactions" on reactions;
create policy "read reactions" on reactions for select using (true);
drop policy if exists "create reaction" on reactions;
create policy "create reaction" on reactions for insert with check (true);

-- Moment of the service (admin-pinned, or auto top-hearted)
alter table events add column if not exists featured_photo_id uuid references photos(id) on delete set null;

-- Recurring service: one persistent QR/code, archived weekly sessions
alter table events add column if not exists is_recurring boolean not null default false;
alter table events add column if not exists current_session text;   -- e.g. '2026-06-28'; null = single session
alter table photos add column if not exists session_label text;     -- which session the upload belongs to
create index if not exists idx_photos_session on photos(session_label);

-- "Connect" call-to-action shown after upload
alter table events add column if not exists connect_label text;
alter table events add column if not exists connect_label_es text;
alter table events add column if not exists connect_url text;

-- ============================================================
-- HALO V2 — Phase 3a: smarter curation (noise-aware score + best-of-burst)
-- Additive + idempotent.
-- ============================================================
alter table photos add column if not exists phash text;                         -- perceptual hash (dHash) for burst dedup
alter table photos add column if not exists is_burst_dup boolean not null default false; -- near-duplicate of a kept shot
create index if not exists idx_photos_phash on photos(phash);

-- ============================================================
-- HALO V2 — Phase 3b: auto-crop, in-browser auto-flag, tags
-- Additive + idempotent.
-- ============================================================
alter table photos add column if not exists crops jsonb;                          -- {"1x1":path,"4x5":path,...}
alter table photos add column if not exists auto_flagged boolean not null default false; -- in-browser model flagged as explicit
alter table photos add column if not exists tags text[] not null default '{}';    -- worship | baptism | kids | fellowship
create index if not exists idx_photos_tags on photos using gin (tags);

-- ============================================================
-- HALO — Early-access leads (marketing waitlist)
-- Written only by the request-access function (service role).
-- ============================================================
create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  church      text,
  name        text,
  email       text,
  size        text,
  event_type  text,
  budget      text,
  created_at  timestamptz not null default now()
);
alter table leads enable row level security;  -- no anon policies: only service role can read/write

-- ============================================================
-- HALO — Landing hero carousel images (admin-managed)
-- Public can read active images; only the service-role function writes.
-- ============================================================
create table if not exists hero_images (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null,
  sort         int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table hero_images enable row level security;
drop policy if exists "read hero" on hero_images;
create policy "read hero" on hero_images for select using (true);

-- ============================================================
-- HALO — Event type + slideshow music
-- ============================================================
alter table events add column if not exists category text;   -- wedding | quinceanera | church | corporate | gala | other
alter table events add column if not exists music_url text;  -- null=auto by type, "none"=off, "/music/x.mp3"=preset, or storage path=upload

-- ============================================================
-- HALO — Music/content rights acknowledgment (paper trail)
-- ============================================================
alter table events add column if not exists music_rights_ack boolean not null default false;
alter table events add column if not exists music_rights_ack_at timestamptz;
