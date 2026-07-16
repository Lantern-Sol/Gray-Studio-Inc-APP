import { vercelPreset } from "@vercel/react-router/vite";

/** @type {import('@react-router/dev/config').Config} */
export default {
  ssr: true,
  // Only apply the Vercel preset on Vercel builds so local `shopify app dev` is unaffected.
  presets: process.env.VERCEL ? [vercelPreset()] : [],
};
