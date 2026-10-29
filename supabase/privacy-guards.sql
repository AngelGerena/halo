-- ============================================================
-- HALO — privacy + integrity guards
-- Run in the Supabase SQL Editor. Idempotent: safe to run more than once.
--
-- 1. Guest emails (and the new per-guest secret) can no longer be read from
--    the browser. Hosts never needed them client-side; the server functions
--    (publish-event, notify-welcome, ...) use the service role and still can.
-- 2. Each guest gets a private `secret` that only their own phone holds, so
--    nobody else can rename them (no prank names on the TV) or change their
--    email. rename-contributor checks it server-side.
-- 3. Signed-in users can no longer edit their own profile's is_admin / plan /
--    billing fields from the browser (only full_name stays editable).
-- 4. Photos and guestbook wishes inserted from the browser are checked by the
--    database itself: files must live in the guest's own upload folder (no
--    outside image links), the guest must belong to the event, and an event
--    that requires review can never receive an "approved" row directly.
-- ============================================================

-- ---------- 1. CONTRIBUTORS: new columns ----------
-- welcomed_at / notified_at are also added by the welcome-email change; adding
-- them here (if missing) lets the column grant below succeed either way.
alter table public.contributors add column if not exists welcomed_at timestamptz;
alter table public.contributors add column if not exists notified_at timestamptz;
alter table public.contributors add column if not exists secret text;

-- ---------- 2. CONTRIBUTORS: hide email + secret from the browser ----------
-- Table-wide SELECT is replaced by a column list that leaves out email and
-- secret. Revoking the table privilege also clears any earlier column grants,
-- so re-running this block always ends in the same state.
-- NOTE: a column added to contributors in the future is NOT readable by the
-- browser until it is added to this grant list.
revoke select on table public.contributors from anon, authenticated;
grant select (id, event_id, name, created_at, welcomed_at, notified_at)
  on table public.contributors to anon, authenticated;

-- ---------- 3. PROFILES: no self-promotion to admin ----------
-- "profiles update own" let any signed-in user update every column of their
-- own row, including is_admin, plan and subscription_status. Keep the policy,
-- but only allow the full_name column to be written from the browser.
do $$
begin
  if to_regclass('public.profiles') is not null then
    revoke insert, update, delete on table public.profiles from anon, authenticated;
    grant update (full_name) on table public.profiles to authenticated;
  end if;
end $$;

-- ---------- 4. PHOTOS: guard browser inserts ----------
-- Runs as the caller (security invoker), so it only sees what that guest can
-- see. Netlify functions (service_role) and the SQL editor are not affected.
create or replace function public.halo_guard_photo_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ev            record;
  prefix        text;
  row_json      jsonb;
  v_video       text;
  needs_review  boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  select e.id, e.moderation_mode, e.protect_minors
    into ev
    from public.events e
   where e.id = new.event_id;
  if not found then
    raise exception 'HALO: unknown event' using errcode = '42501';
  end if;

  if new.contributor_id is null or not exists (
    select 1 from public.contributors c
     where c.id = new.contributor_id and c.event_id = new.event_id
  ) then
    raise exception 'HALO: contributor does not belong to this event' using errcode = '42501';
  end if;

  -- sign-upload.js builds every key as <event_id>/<contributor_id>/<file>.
  prefix := new.event_id::text || '/' || new.contributor_id::text || '/';

  if new.storage_path is null
     or left(new.storage_path, length(prefix)) <> prefix
     or position('..' in new.storage_path) > 0 then
    raise exception 'HALO: storage_path must be an uploaded file' using errcode = '42501';
  end if;

  if new.edited_path is not null
     and (left(new.edited_path, length(prefix)) <> prefix or position('..' in new.edited_path) > 0) then
    raise exception 'HALO: edited_path must be an uploaded file' using errcode = '42501';
  end if;

  -- video_path / crops are read through jsonb so this works whether or not
  -- the optional video-clips migration has been run.
  row_json := to_jsonb(new);
  v_video := row_json ->> 'video_path';
  if v_video is not null
     and (left(v_video, length(prefix)) <> prefix or position('..' in v_video) > 0) then
    raise exception 'HALO: video_path must be an uploaded file' using errcode = '42501';
  end if;
  if row_json ? 'crops' and jsonb_typeof(row_json -> 'crops') <> 'null' then
    raise exception 'HALO: crops are set by the server only' using errcode = '42501';
  end if;

  -- Moderation: mirror the guest page (EventPage.jsx). Review mode, or a
  -- child-flagged photo while protect_minors is on, or an auto-flagged photo,
  -- always lands as pending. Anything unexpected also becomes pending.
  needs_review := coalesce(ev.moderation_mode, 'off') = 'review'
               or (coalesce(ev.protect_minors, false) and coalesce(new.has_minors, false))
               or coalesce((row_json ->> 'auto_flagged')::boolean, false);
  if new.status is null or new.status not in ('approved', 'pending', 'hidden') then
    new.status := 'pending';
  end if;
  if needs_review and new.status = 'approved' then
    new.status := 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists halo_guard_photo_insert on public.photos;
create trigger halo_guard_photo_insert
  before insert on public.photos
  for each row execute function public.halo_guard_photo_insert();

-- ---------- 5. WISHES (guestbook): guard browser inserts ----------
create or replace function public.halo_guard_wish_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  mode text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  select e.moderation_mode into mode from public.events e where e.id = new.event_id;
  if not found then
    raise exception 'HALO: unknown event' using errcode = '42501';
  end if;

  if new.contributor_id is not null and not exists (
    select 1 from public.contributors c
     where c.id = new.contributor_id and c.event_id = new.event_id
  ) then
    raise exception 'HALO: contributor does not belong to this event' using errcode = '42501';
  end if;

  if new.status is null or new.status not in ('approved', 'pending') then
    new.status := 'pending';
  end if;
  if coalesce(mode, 'off') = 'review' and new.status = 'approved' then
    new.status := 'pending';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.wishes') is not null then
    drop trigger if exists halo_guard_wish_insert on public.wishes;
    create trigger halo_guard_wish_insert
      before insert on public.wishes
      for each row execute function public.halo_guard_wish_insert();
  end if;
end $$;

-- Tell the API about the new column right away.
notify pgrst, 'reload schema';
