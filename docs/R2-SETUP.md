# HALO — Cloudflare R2 storage

Photo and audio **files** now live in Cloudflare R2 instead of Supabase Storage.
Supabase is still the **database** (events, contributors, photos rows, reactions, etc.).
This keeps storage costs flat and predictable: R2 has **free egress**, so serving
galleries never runs up a bandwidth bill.

## What changed in the code

- `netlify/functions/_r2.js` — shared S3 client for R2 (upload, download, delete, presign).
- `netlify/functions/sign-upload.js` — gives guest browsers short-lived presigned PUT URLs.
- `netlify/functions/sign-upload-admin.js` — same, for admin hero/music uploads (passcode-gated).
- `src/lib/r2upload.js` — client helpers to request a signed URL and PUT the file to R2.
- `src/lib/supabase.js` — `publicUrl()` now builds R2 public URLs (and passes through any legacy full URLs).
- Server functions `edit-photo`, `crop-photo`, `delete-photos`, `delete-event`,
  `manage-hero`, `generate-music` read/write/delete via R2 instead of Supabase Storage.

Guests' phones still upload **directly** to storage (no slow middleman) — they just
PUT to a presigned R2 URL instead of uploading through the Supabase client.

## Environment variables (Netlify → halo-frame → Environment variables)

Build (client) — must be prefixed `VITE_`:

| Variable | Value |
|---|---|
| `VITE_R2_PUBLIC_URL` | `https://pub-1805c5086c004da6870a1bac08006eae.r2.dev` |

Server (functions):

| Variable | Value |
|---|---|
| `R2_ACCESS_KEY_ID` | your R2 access key id |
| `R2R2_SECRET_ACCESS_KEY` | your R2 secret access key (marked *secret*) |
| `R2_BUCKET` | `halo-events` |
| `R2_ENDPOINT` | `https://03820441c89dae3615b80c23e0a4ad9e.r2.cloudflarestorage.com` |
| `R2_PUBLIC_URL` | `https://pub-1805c5086c004da6870a1bac08006eae.r2.dev` |

> **Note on the secret's name.** It was created in Netlify as `R2R2_SECRET_ACCESS_KEY`
> (a doubled prefix). The code reads that exact name, and also falls back to
> `R2_SECRET_ACCESS_KEY`, so you can rename it cleanly later with no code change.

> **`VITE_R2_PUBLIC_URL` is still needed.** The four R2 vars added during setup are
> for the server functions. The client build also needs the public URL under the
> `VITE_` name to show images — add it if it isn't there yet.

## One-time bucket settings (CORS + 60-day auto-delete)

These are bucket-level settings, not app code. Two ways to apply them:

### Option 1 — script (fastest, if the token allows it)

```bash
R2_ENDPOINT="https://03820441c89dae3615b80c23e0a4ad9e.r2.cloudflarestorage.com" \
R2_ACCESS_KEY_ID="<access key id>" \
R2_SECRET_ACCESS_KEY="<secret>" \
R2_BUCKET="halo-events" \
node scripts/r2-bucket-setup.mjs
```

If it prints `AccessDenied`, the API token can read/write objects but not change
bucket settings — use Option 2.

### Option 2 — Cloudflare dashboard

**CORS** (lets guest browsers upload): R2 → `halo-events` → **Settings** → **CORS Policy** → add:

```json
[
  {
    "AllowedOrigins": [
      "https://halo-frame.netlify.app",
      "http://localhost:5173",
      "http://localhost:8888"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add any custom domain you later point at the app to `AllowedOrigins`.

**60-day auto-delete**: R2 → `halo-events` → **Settings** → **Object lifecycle rules**
→ add a rule: delete objects **60 days** after they are created, applied to the whole
bucket (empty prefix).

## Retention policy (product note)

Galleries live for **60 days**, then auto-delete. The marketing site, the in-app
disclaimer, and (future) pre-deletion reminder emails should all say 60 days so the
promise matches what the bucket actually does.

## Legacy events

Any photos uploaded before this migration still have their old Supabase paths in the
DB. `publicUrl()` passes through full URLs unchanged, but bare Supabase object paths
will now resolve against R2 and 404. If there are real events worth keeping, copy
those objects from the Supabase `halo` bucket into R2 under the same keys. If it's all
test data, nothing to do.
