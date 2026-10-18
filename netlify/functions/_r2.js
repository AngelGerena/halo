// HALO — shared R2 (Cloudflare) storage helper for Netlify functions.
//
// R2 is S3-compatible, so we use the AWS S3 SDK v3 pointed at the R2 endpoint.
// Supabase stays the database; only photo/audio FILES live in R2 now.
//
// Env vars (set in Netlify → halo-frame → Environment variables):
//   R2_ACCESS_KEY_ID       — access key id (not secret)
//   R2R2_SECRET_ACCESS_KEY — secret access key (secret; name kept as created in Netlify)
//   R2_BUCKET              — bucket name (halo-events)
//   R2_ENDPOINT            — https://<account>.r2.cloudflarestorage.com
//   R2_PUBLIC_URL          — https://pub-xxxx.r2.dev  (public read base, no trailing slash)
//
// NOTE on the secret var name: it was created in Netlify as R2R2_SECRET_ACCESS_KEY
// (a typo that doubled the prefix). Rather than risk re-pasting the secret, the code
// reads that exact name. We also fall back to R2_SECRET_ACCESS_KEY so a future clean
// rename needs no code change.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const SECRET =
  process.env.R2R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;

export const R2_BUCKET = process.env.R2_BUCKET;
export const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

let _client = null;
export function r2() {
  if (_client) return _client;
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !SECRET) {
    throw new Error("R2 is not configured (missing endpoint / access key / secret).");
  }
  _client = new S3Client({
    region: "auto", // R2 ignores region but the SDK requires one
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: SECRET,
    },
  });
  return _client;
}

// Public read URL for a stored object (served from the r2.dev public bucket URL).
export function publicUrl(path) {
  if (!path) return null;
  return `${R2_PUBLIC_URL}/${String(path).replace(/^\/+/, "")}`;
}

// Upload a Buffer (used by server functions: edit, crop, music).
export async function putObject(path, buffer, contentType) {
  await r2().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: path,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    })
  );
  return path;
}

// Download an object to a Buffer (used by edit/crop to read the source image).
export async function getObjectBuffer(path) {
  const res = await r2().send(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: path })
  );
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Delete many objects at once (used by delete-photos, delete-event, hero remove).
// R2 supports the S3 DeleteObjects batch (max 1000 keys per call).
export async function deleteObjects(paths) {
  const keys = (paths || []).filter(Boolean);
  if (!keys.length) return { deleted: 0 };
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await r2().send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      })
    );
    deleted += chunk.length;
  }
  return { deleted };
}

// Presigned PUT URL so a browser can upload a file directly to R2 without
// ever seeing the secret. Short-lived (default 5 min).
export async function presignPut(path, contentType, expiresIn = 300) {
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: path,
    ContentType: contentType || "application/octet-stream",
  });
  return getSignedUrl(r2(), cmd, { expiresIn });
}
