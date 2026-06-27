# HALO — Setup & Deploy

Holy moments, auto-curated. A QR-based photo collection app for church events:
congregants scan, upload, and get their own shareable gallery. HALO auto-curates
(keeps sharp, well-exposed shots). You — the super admin — create/name events,
generate QR codes, and download everything for editing and socials.

Stack: React + Vite · Supabase (DB + Storage) · Netlify (hosting + Functions).

---

## 1. Supabase

1. Create a project at supabase.com.
2. Open SQL Editor → paste all of `supabase/schema.sql` → Run.
   This creates the tables, the public `halo` storage bucket, and RLS policies.
3. Project Settings → API. Copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key (keep private — server only)

## 2. GitHub

1. Create a new repo (e.g. `AngelGerena/halo`).
2. Push this folder:
   ```
   git init
   git add .
   git commit -m "HALO MVP"
   git branch -M main
   git remote add origin https://github.com/AngelGerena/halo.git
   git push -u origin main
   ```

## 3. Netlify

1. Add new site → Import from GitHub → pick the repo.
2. Build settings are auto-read from `netlify.toml`
   (build `npm run build`, publish `dist`, functions `netlify/functions`).
3. Site settings → Environment variables → add:

   | Key | Value |
   |-----|-------|
   | `VITE_SUPABASE_URL` | your project URL |
   | `VITE_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_URL` | your project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role secret |
   | `ADMIN_PASSCODE` | a strong passcode you choose |

4. Deploy. Every push to `main` redeploys automatically.

---

## Using HALO

- **Admin:** go to `https://your-site.netlify.app/admin`, enter your passcode.
  Create an event (name it, optional host/date/code, set keep threshold).
  Each event gets a QR code — Save QR (PNG) to print or display.
- **Congregants:** scan the QR → it opens `/e/EVENT-CODE` → they enter a name →
  upload photos. Sharp/bright shots are kept; weak ones set aside.
- **Sharing:** each person gets a personal `/g/...` share link for their kept photos.
- **Export:** in the admin event view, download any photo, or "Download all".

---

## Local dev (optional)

```
cp .env.example .env      # fill in your keys
npm install
npm run dev               # frontend at localhost:5173
```
Functions need the Netlify CLI to run locally: `netlify dev`.

---

## Live slideshow (premium projection)

Open `/live/EVENT-CODE` (or the "Launch live slideshow" button in the admin
event view) on the machine driving your projector or screen. It shows kept,
auto-edited photos full-bleed with slow Ken Burns motion and cross-fades,
**polls every 12 seconds** so new uploads appear during the service, and hides
its controls after a few idle seconds.

Controls: arrow keys to move, space to pause, `F` for fullscreen. The on-screen
Pause / Fullscreen buttons do the same. New photos are slipped in right after the
current one so they surface quickly without jarring the flow.

## Email (Resend)

Set `RESEND_API_KEY` and `HALO_FROM_EMAIL` in Netlify env. For real delivery,
verify your domain in Resend and use a from-address on it; for testing you can
use `onboarding@resend.dev`. Two flows:

- **Welcome email** — when a contributor joins and leaves an email, they get a
  branded welcome with their personal gallery link.
- **Publish + notify all** — in the admin event view, "Publish + notify all"
  marks the event published and emails every contributor (with an email and at
  least one kept photo) that their gallery is live. Re-runnable to re-send.

All emails use the HALO template (ink/gold, Jeremiah 29:11 strip) in
`netlify/functions/_email.js` — edit there to adjust wording or styling.

## Auto-edit (Phase 3 — included)

Every upload triggers the `edit-photo` Netlify Function, which uses Sharp to apply
automatic corrections and writes an **edited copy** alongside the original
(originals are never overwritten):

- auto levels / exposure (normalize)
- gentle white-balance correction from per-channel means
- brightness lift for dark images only
- mild vibrance + light sharpening
- EXIF auto-rotate, re-encoded as quality-92 JPEG

In the admin event view, toggle **Edited / Original** to preview and to choose
which version "Download all" pulls. Congregant and public galleries show the
edited version automatically once it's ready, falling back to the original.

To tune the look, edit `autoCorrect()` in `netlify/functions/edit-photo.js`
(saturation, sharpen sigma, brightness thresholds).

## Roadmap

- **Branded preset/LUT layer:** a consistent Finesse grade on top of corrections.
- **AI enhance toggle:** optional premium per-image enhance via external API.
- **Video support:** extend accepted types + a separate quality heuristic.
- **Bulk ZIP export:** single-download archive instead of per-file.
- **Server-side scoring:** move curation off-device for consistency at scale.

Threshold tuning: the keep cutoff is per-event (`keep_threshold`). Start at 45;
raise it for stricter curation, lower it to keep more.
