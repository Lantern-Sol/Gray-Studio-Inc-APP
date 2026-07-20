import crypto from "node:crypto";
import { put } from "@vercel/blob";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ---------------------------------------------------------------------------
// Image storage. Two providers, selected by env:
//
//   - Cloudflare R2 (active when R2_* env vars are set) — S3-compatible, free
//     egress. Public bucket + random-suffixed keys = unguessable URLs.
//   - Vercel Blob (fallback when R2 vars are absent) — the original provider.
//     To revert to it, just remove the R2_* env vars; no code change needed.
//
// Required R2 env vars:
//   R2_ACCOUNT_ID        Cloudflare account id (R2 dashboard)
//   R2_ACCESS_KEY_ID     from "Manage R2 API Tokens"
//   R2_SECRET_ACCESS_KEY from "Manage R2 API Tokens"
//   R2_BUCKET            bucket name (e.g. "portraits")
//   R2_PUBLIC_BASE_URL   the bucket's public base URL, no trailing slash
//                        (e.g. "https://pub-xxxx.r2.dev" or a custom domain)
// ---------------------------------------------------------------------------

function r2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_BASE_URL,
  );
}

let r2Client;
function getR2Client() {
  r2Client ??= new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return r2Client;
}

async function storeImageR2(pathname, buffer, mime) {
  // Random suffix keeps URLs unguessable — the bucket is public, so this is what
  // protects un-watermarked print files (same approach Vercel Blob uses).
  const key = `${pathname}-${crypto.randomUUID()}`;
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mime,
    }),
  );
  return `${process.env.R2_PUBLIC_BASE_URL}/${key}`;
}

async function storeImageVercelBlob(pathname, buffer, mime) {
  const blob = await put(pathname, buffer, {
    access: "public",
    contentType: mime,
    addRandomSuffix: true,
  });
  return blob.url;
}

export async function storeImage(pathname, buffer, mime) {
  if (r2Configured()) {
    return storeImageR2(pathname, buffer, mime);
  }
  return storeImageVercelBlob(pathname, buffer, mime);
}
