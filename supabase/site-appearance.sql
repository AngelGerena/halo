-- ============================================================
-- HALO — Site Appearance (theme + swappable landing photos)
-- Run this whole block in the Supabase SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT throughout.
-- ============================================================

-- One-row settings table for the public marketing/landing page.
-- id is pinned to 1 so there is always exactly one settings row.
create table if not exists public.site_settings (
  id          int primary key default 1,
  theme       text not null default 'midnight',
  -- Swappable landing images. NULL = use the bundled default that ships
  -- with the site (/landing/images/<name>.webp). A value is an R2 storage
  -- path (e.g. "site/1730000000-ab12.jpg") resolved to a public URL by the
  -- site-config function.
  img_friends     text,
  img_wedding     text,
  img_qr          text,
  img_quinceanera text,
  updated_at  timestamptz not null default now(),
  constraint site_settings_singleton check (id = 1)
);

-- Seed the single row if it's not there yet.
insert into public.site_settings (id, theme)
values (1, 'midnight')
on conflict (id) do nothing;

-- ---------- Row Level Security ----------
alter table public.site_settings enable row level security;

-- Public (anon) may READ the settings row — the landing page fetches it.
-- (The site-config function also reads it with the service role; this policy
--  lets the row be read directly if ever needed, without exposing writes.)
drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read
  on public.site_settings
  for select
  using (true);

-- No INSERT/UPDATE/DELETE policies => writes are blocked for anon and
-- authenticated roles. All writes go through the admin-only manage-site
-- Netlify function, which uses the service role (bypasses RLS) after
-- verifying profiles.is_admin. This keeps theme/photo changes admin-only.

-- Touch updated_at on every change (writes come via service role).
create or replace function public.site_settings_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_settings_touch_trg on public.site_settings;
create trigger site_settings_touch_trg
  before update on public.site_settings
  for each row execute function public.site_settings_touch();
