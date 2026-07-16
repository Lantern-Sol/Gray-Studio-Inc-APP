import { waitUntil } from "@vercel/functions";

/**
 * Run work after the response is sent.
 *
 * On Vercel, `waitUntil` keeps the serverless function alive until the promise settles
 * (up to the function's maxDuration). On the local node server it's a no-op and the
 * floating promise simply runs to completion — either way the caller can return
 * immediately and let clients poll for the result.
 */
export function runInBackground(task) {
  const promise = Promise.resolve().then(task);
  promise.catch((error) => console.error("[background]", error));
  try {
    waitUntil(promise);
  } catch {
    // Not in a Vercel request context (local dev) — the promise still runs.
  }
}
