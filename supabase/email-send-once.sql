-- HALO: send-once markers for guest emails (safe to run more than once).
-- welcomed_at: set when a guest's welcome email is sent (notify-welcome).
-- notified_at: set when a guest's "your photos are ready" email is sent
--              (publish-event), so pressing Publish again never re-emails them.
alter table contributors add column if not exists welcomed_at timestamptz;
alter table contributors add column if not exists notified_at timestamptz;
