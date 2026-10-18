#!/usr/bin/env node
// HALO — one-time R2 bucket configuration for the `halo-events` bucket.
//
// Applies two bucket-level settings that cannot live in app code:
//   1. CORS   — lets guest browsers PUT directly to R2 via presigned URLs
//   2. Lifecycle — auto-deletes every object 60 days after upload
//
// RUN THIS ONCE, LOCALLY, with the R2 credentials in your shell env:
//
//   R2_ENDPOINT="https://<account>.r2.cloudflarestorage.com" \
//   R2_ACCESS_KEY_ID="xxxx" \
//   R2_SECRET_ACCESS_KEY="xxxx" \
//   R2_BUCKET="halo-events" \
//   node scripts/r2-bucket-setup.mjs
//
// If the token lacks bucket-admin permission you'll get an AccessDenied error —
// in that case apply both settings in the Cloudflare dashboard instead (see
// docs/R2-SETUP.md). Requires: npm i @aws-sdk/client-s3
//
// Note: the live app reads the secret from R2R2_SECRET_ACCESS_KEY in Netlify;
// this local script uses the conventional R2_SECRET_ACCESS_KEY name.

import {
  S3Client,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";

const {
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET = "halo-events",
} = process.env;

if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error("Missing env: set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

// CORS: allow the live sites to PUT/GET. Add any custom domains here later.
const CORS = {
  Bucket: R2_BUCKET,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedOrigins: [
          "https://halo-frame.netlify.app",
          "http://localhost:5173",
          "http://localhost:8888",
        ],
        AllowedMethods: ["GET", "PUT", "HEAD"],
        AllowedHeaders: ["*"],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3600,
      },
    ],
  },
};

// Lifecycle: delete every object 60 days after it is created.
const LIFECYCLE = {
  Bucket: R2_BUCKET,
  LifecycleConfiguration: {
    Rules: [
      {
        ID: "halo-60day-autodelete",
        Status: "Enabled",
        Filter: { Prefix: "" }, // all objects
        Expiration: { Days: 60 },
      },
    ],
  },
};

async function main() {
  console.log(`Configuring bucket: ${R2_BUCKET}\n`);

  await s3.send(new PutBucketCorsCommand(CORS));
  console.log("✓ CORS applied");

  await s3.send(new PutBucketLifecycleConfigurationCommand(LIFECYCLE));
  console.log("✓ Lifecycle applied (60-day auto-delete)");

  // read back to confirm
  const cors = await s3.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }));
  const life = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: R2_BUCKET }));
  console.log("\nVerified CORS rules:", JSON.stringify(cors.CORSRules, null, 2));
  console.log("Verified Lifecycle rules:", JSON.stringify(life.Rules, null, 2));
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("\nFailed:", e.name, "-", e.message);
  if (String(e.name).includes("AccessDenied")) {
    console.error(
      "\nThe API token can read/write objects but not change bucket settings.\n" +
        "Apply CORS + the 60-day lifecycle rule in the Cloudflare dashboard instead —\n" +
        "see docs/R2-SETUP.md for the exact steps."
    );
  }
  process.exit(1);
});
