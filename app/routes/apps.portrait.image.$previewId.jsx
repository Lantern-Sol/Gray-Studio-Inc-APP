import { authenticate } from "../shopify.server";
import db from "../db.server";

// Serves ONLY the watermarked preview — the clean print file never has a route that
// returns it to the storefront. It's read server-side only, from the orders/paid webhook.
export async function loader({ request, params }) {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const preview = await db.portraitPreview.findUnique({
    where: { id: params.previewId },
    include: { job: true },
  });

  if (!preview || preview.job.shop !== session.shop) {
    return new Response("Not found", { status: 404 });
  }

  // Images live in Vercel Blob; redirect to the watermarked file's unguessable URL.
  return new Response(null, {
    status: 302,
    headers: {
      Location: preview.watermarkedUrl,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
