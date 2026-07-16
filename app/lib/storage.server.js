import { put } from "@vercel/blob";

// All portrait images live in Vercel Blob (works locally too — set BLOB_READ_WRITE_TOKEN
// in .env, copied from the Vercel dashboard). `addRandomSuffix` makes URLs unguessable,
// which is what keeps un-watermarked print files private despite public access mode.
export async function storeImage(pathname, buffer, mime) {
  const blob = await put(pathname, buffer, {
    access: "public",
    contentType: mime,
    addRandomSuffix: true,
  });
  return blob.url;
}
