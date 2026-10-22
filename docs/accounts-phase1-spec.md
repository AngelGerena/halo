# HALO Client Accounts — Phase 1 Spec (Foundation)

**Status:** spec for review. No code or SQL has been run against production yet.
**Decisions locked (Oct 21):** real admin account (passcode retires) · open sign-up · no free-tier event cap for now · **Stripe pre-wired now, activated later.**

Phase 1 is the security-critical foundation: identity, ownership, and Row Level
Security (RLS). Everything else (client dashboard, super-admin upgrade, payment)
builds on this. Nothing here changes the guest experience.

---

## 1. What exists today (from the codebase survey)

- **No ownership.** Events belong to nobody; one shared `ADMIN_PASSCODE` sees all.
- **RLS is on but wide open.** The browser anon client can `SELECT` every event,
  photo, and contributor. No per-user scoping.
- **All 13 Netlify functions use the Supabase service-role key** → they bypass RLS
  entirely and are gated only by the passcode in the request body.
- **Admin reads come straight from the browser anon client**; mutations go through
  passcode-gated functions.
- No Supabase Auth, no users/profiles table, no `owner_id` anywhere.

## 2. What Phase 1 adds

1. **Supabase Auth** turned on (email + password, open sign-up).
2. A **`profiles`** table — one row per auth user — carrying `is_admin` and the
   **dormant Stripe/billing columns** (pre-wired, unused until Phase 4).
3. **`owner_id`** on `events` → the auth user who owns it.
4. **Rewritten RLS** so an authenticated client sees and edits only their own
   events (and their events' children), while admins see everything. This is the
   piece that guarantees one client can never see another's photos.
5. **Backfill**: every existing event is assigned to Angel's account as owner.
6. **Billing seams** pre-wired dormant so Stripe drops in later with no schema
   surgery.

## 3. What stays exactly the same

Guest scan→upload, quality filtering, burst de-dup, moderation, NSFW check, live
slideshow, galleries, email delivery, R2 storage + 60-day auto-delete — all
untouched. The public `/e/:code`, `/g/:id`, `/live/:code` routes behave identically.

---

## 4. Data model changes

### New table: `profiles`
One row per Supabase Auth user, created automatically on sign-up via a trigger.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `email` | text | copied from auth on creation |
| `full_name` | text | optional display name |
| `is_admin` | boolean default false | **Angel = true**; grants see-everything |
| `plan` | text default 'free' | billing tier — dormant (free/starter/pro/…) |
| `stripe_customer_id` | text | dormant; set when Stripe is wired |
| `stripe_subscription_id` | text | dormant |
| `subscription_status` | text default 'inactive' | dormant (active/past_due/canceled…) |
| `created_at` | timestamptz default now() | |

### `events` — new columns
| Column | Type | Notes |
|---|---|---|
| `owner_id` | uuid → `auth.users(id)` on delete set null | who owns this event |
| `paid` | boolean default true | **dormant billing seam.** Defaults `true` so every event is "unlocked" while payment is off. When Stripe lands, new unpaid events are created `false` and gated until checkout completes. Existing + admin-created events stay `true`. |
| `stripe_payment_intent` | text | dormant; per-event payment reference |

`owner_id` is nullable so guest-era rows and admin-created events are valid; RLS
treats a null owner as admin-only.

---

## 5. The SQL (copy-paste ready for the Supabase SQL editor)

Run this **once** in the HALO Supabase project. It is idempotent (safe to re-run)
and additive — it does not drop or alter existing data, only adds columns, a
table, a trigger, and policies. **Review before running.**

```sql
-- ============================================================
-- HALO Accounts — Phase 1: profiles, ownership, billing seams, RLS
-- Idempotent and additive. Safe to re-run.
-- ============================================================

-- 1. PROFILES ------------------------------------------------
create table if not exists public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text,
  full_name              text,
  is_admin               boolean not null default false,
  plan                   text not null default 'free',
  stripe_customer_id     text,
  stripe_subscription_id text,
  subscription_status    text not null default 'inactive',
  created_at             timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A profile row is auto-created when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: is the current caller an admin? (SECURITY DEFINER avoids RLS recursion)
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Profiles RLS: you read/update your own; admins read all.
drop policy if exists "profiles read own"   on public.profiles;
drop policy if exists "profiles update own"  on public.profiles;
drop policy if exists "profiles admin read"  on public.profiles;
create policy "profiles read own"  on public.profiles for select using (id = auth.uid());
create policy "profiles update own" on public.profiles for update using (id = auth.uid());
create policy "profiles admin read" on public.profiles for select using (public.is_admin());

-- 2. EVENTS: ownership + billing seams -----------------------
alter table public.events add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.events add column if not exists paid boolean not null default true;      -- dormant billing seam
alter table public.events add column if not exists stripe_payment_intent text;              -- dormant
create index if not exists idx_events_owner on public.events(owner_id);

-- 3. REWRITE EVENTS RLS --------------------------------------
-- Replace the wide-open "read active events" with owner/admin/public-read scoping.
-- Public (anon, unauthenticated guests) must still READ an active event by code,
-- because the guest upload page and slideshow fetch the event client-side.
drop policy if exists "read active events" on public.events;

-- a) Public can read ACTIVE events only (guest pages, slideshow). No private data
--    on events; the sensitive surface is photos/contributors, scoped below.
create policy "events public read active"
  on public.events for select
  using (is_active = true);

-- b) Owners can read all their own events (incl. inactive/unpublished).
create policy "events owner read"
  on public.events for select
  using (owner_id = auth.uid());

-- c) Admins read everything.
create policy "events admin read"
  on public.events for select
  using (public.is_admin());

-- Note: INSERT/UPDATE/DELETE on events still happen ONLY via service-role
-- functions (create-event, update-event, delete-event, publish-event). Those
-- functions will be updated in the Phase 1 function-layer change (§6) to verify
-- the caller's identity and stamp/enforce owner_id. We deliberately do NOT open
-- client-side write policies on events.

-- 4. SCOPE CHILD TABLES TO EVENT OWNER -----------------------
-- Photos/contributors/reactions are reachable today by anon with using(true).
-- Tighten reads so only: the event's owner, an admin, or a guest reading an
-- ACTIVE event can see them. Guest INSERT paths (contributors/photos/reactions)
-- stay open with check(true) — those are how guests upload; the service-role
-- sign-upload + create flows already validate contributor↔event.

-- PHOTOS
drop policy if exists "read photos" on public.photos;
create policy "photos read scoped"
  on public.photos for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.events e
      where e.id = photos.event_id
        and (e.owner_id = auth.uid() or e.is_active = true)
    )
  );
-- keep guest insert open (unchanged): "create photo" with check (true)

-- CONTRIBUTORS
drop policy if exists "read contributors" on public.contributors;
create policy "contributors read scoped"
  on public.contributors for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.events e
      where e.id = contributors.event_id
        and (e.owner_id = auth.uid() or e.is_active = true)
    )
  );
-- keep guest insert open (unchanged): "create contributor" with check (true)

-- REACTIONS
drop policy if exists "read reactions" on public.reactions;
create policy "reactions read scoped"
  on public.reactions for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.events e
      where e.id = reactions.event_id
        and (e.owner_id = auth.uid() or e.is_active = true)
    )
  );
-- keep guest insert open (unchanged): "create reaction" with check (true)

-- 5. BACKFILL: assign all existing events to Angel ----------
-- Run AFTER Angel's account exists (sign up at /signup, or create in Supabase
-- Auth dashboard), then set the email below and run this block.
-- This also marks that account as admin.
do $$
declare angel_id uuid;
begin
  select id into angel_id from auth.users
    where email = 'REPLACE_WITH_ANGEL_EMAIL' limit 1;
  if angel_id is null then
    raise notice 'No auth user for that email yet — create the account first, then re-run this block.';
  else
    update public.profiles set is_admin = true where id = angel_id;
    update public.events set owner_id = angel_id where owner_id is null;
    raise notice 'Backfill done: events assigned to %, marked admin.', angel_id;
  end if;
end $$;
```

### Why these policies are safe

- **No cross-client leak:** a photo/contributor/reaction is readable only if the
  caller is an admin, owns the parent event, or the parent event is `is_active`
  (a live event guests are actively using). An authenticated bride querying the
  `photos` table gets back only rows whose event she owns or that are currently
  live — never another client's private/unpublished event.
- **Guests keep working:** anon users read active events and their photos (needed
  for the upload page and slideshow), and the existing open INSERT policies let
  them contribute. Unchanged.
- **Writes stay server-side:** events are still mutated only by service-role
  functions, so we're not widening the attack surface with client write policies.
- **`is_admin()` is `SECURITY DEFINER`** and reads `profiles` directly, avoiding
  the classic RLS-recursion trap (a policy on `profiles` that calls a function
  that selects `profiles`).

---

## 6. Function-layer change (same phase, after SQL is verified)

The 13 service-role functions trust `ADMIN_PASSCODE` today. In Phase 1 we move
the event-ownership functions to verify the **caller's Supabase session** instead:

- Frontend sends the user's Supabase **access token** (JWT) in the request.
- `create-event` / `update-event` / `delete-event` / `publish-event` verify the
  token server-side (`supabase.auth.getUser(jwt)`), then:
  - `create-event`: stamps `owner_id = caller`; sets `paid` per the billing seam
    (today always `true`; later `false` + Stripe gate).
  - `update/delete/publish`: confirm the caller owns the event **or** is admin
    before acting (service role still does the write, but only after the check).
- `ADMIN_PASSCODE` stays valid as an **admin override** during the transition so
  nothing breaks mid-migration; it's removed once the admin account is in use.

Photo-level functions (moderate, crop, tag, delete-photos, edit, sign-upload-admin)
get the same owner-or-admin check keyed on the photo's event.

This function change ships **after** the SQL is run and verified, as its own
reviewed step, so the database foundation is proven before app code depends on it.

---

## 7. Rollout order (nothing live until you merge/run each step)

1. **Review this spec.** (You are here.)
2. **Run the SQL** (§5) in Supabase — minus the backfill block.
3. **Create Angel's admin account** (sign up once the auth UI lands in Phase 2, or
   add the user in the Supabase Auth dashboard now).
4. **Run the backfill block** with Angel's email → existing events become his, his
   account becomes admin.
5. **Verify** in Supabase: sign in as a throwaway client, confirm it sees zero
   events; confirm Angel's account sees all. (I'll give exact test queries.)
6. **Function-layer change** (§6) as a reviewed PR.
7. Proceed to **Phase 2** (client dashboard).

## 7a. RLS verified against real Postgres (leak test passed)

The SQL was run end-to-end against a local Postgres 16 with the current HALO
schema loaded and the Supabase `auth` schema stubbed (`auth.users` + `auth.uid()`).
Three accounts were seeded — admin (Angel), Client A (bride), Client B (church) —
each client given a **private (inactive)** event with a photo, plus one shared
**active** event. Queried as each identity under RLS (non-superuser role):

| Identity | Events visible | Private photos visible |
|---|---|---|
| Bride (Client A) | her private event + the active one | **only her own** |
| Church (Client B) | its private event + the active one | **only its own** |
| Admin (Angel) | **all three** | **both** |
| Anonymous guest | only the active event | **none** |

**Result: no cross-client leak.** The bride cannot see the church's private event
or photos, and vice versa; the admin sees everything; guests see only live events
and never a private event's photos. This is the security guarantee the entire
accounts build rests on, and it holds.

## 8. Stripe pre-wiring summary (activated in Phase 4)

Already in place after Phase 1, dormant:
- `profiles.plan`, `.stripe_customer_id`, `.stripe_subscription_id`,
  `.subscription_status`.
- `events.paid`, `.stripe_payment_intent`.
- `create-event` reads the billing seam when stamping `paid`.

Phase 4 then only adds: a Stripe checkout function, a webhook to flip
`subscription_status` / `paid`, and the UI to trigger checkout — no schema change.
