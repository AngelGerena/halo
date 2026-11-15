-- HALO: 60-day gallery retention.
--
-- A one-time event's gallery stays open for 60 days after its FIRST photo
-- arrives, then closes: the nightly gallery-retention function deletes the
-- photo files and rows and stamps closed_at. Recurring events (weekly church
-- services) never close; each photo is removed 60 days after it was taken.
--
-- expires_at       when the gallery closes (set from the first photo; an admin
--                  can push it later)
-- closed_at        when the cleanup ran; the event row, cover and guestbook stay
-- expiry_notified  which host reminders went out, e.g. {"30": "...", "7": "..."}
--
-- Safe to run more than once.

alter table public.events add column if not exists expires_at timestamptz;
alter table public.events add column if not exists closed_at timestamptz;
alter table public.events add column if not exists expiry_notified jsonb not null default '{}'::jsonb;

create index if not exists idx_events_expires_at on public.events (expires_at) where closed_at is null;
create index if not exists idx_photos_event_created on public.photos (event_id, created_at);

-- Backfill: one-time events that already have photos close 60 days after
-- their first photo (never sooner than a week from now, so every host gets
-- the 7-day and 1-day reminders).
update public.events e
   set expires_at = greatest(sub.first_at + interval '60 days', now() + interval '7 days')
  from (select event_id, min(created_at) as first_at from public.photos group by event_id) sub
 where sub.event_id = e.id
   and e.expires_at is null
   and e.closed_at is null
   and coalesce(e.is_recurring, false) = false;

-- Guests can't add photos to a gallery that has closed.
create or replace function public.halo_block_closed_event()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if exists (select 1 from public.events e where e.id = new.event_id and e.closed_at is not null) then
    raise exception 'HALO: this gallery has closed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists halo_block_closed_event on public.photos;
create trigger halo_block_closed_event
  before insert on public.photos
  for each row execute function public.halo_block_closed_event();
