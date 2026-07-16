import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getAiPortraitProvider } from "../lib/ai-portrait-provider.server";
import { watermarkImage } from "../lib/watermark.server";
import { storeImage } from "../lib/storage.server";
import { runInBackground } from "../lib/background.server";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export async function action({ request }) {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return Response.json({ error: "unknown_shop" }, { status: 401 });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const formData = await request.formData();
  const scene = formData.get("scene")?.toString();
  const photo = formData.get("photo");

  if (!scene) {
    return Response.json({ error: "missing_scene" }, { status: 400 });
  }
  if (!(photo instanceof File)) {
    return Response.json({ error: "missing_photo" }, { status: 400 });
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return Response.json({ error: "photo_too_large" }, { status: 400 });
  }

  const sourceBuffer = Buffer.from(await photo.arrayBuffer());
  const sourceMime = photo.type || "image/jpeg";

  const job = await db.portraitJob.create({
    data: {
      shop: session.shop,
      scene,
      status: "pending",
      sourceMime,
    },
  });

  // Respond immediately with the job id; the storefront polls /status/:jobId.
  // Generation can take 20-60s with a real AI provider, which would exceed serverless
  // request limits if awaited here.
  runInBackground(() => runGeneration(job.id, sourceBuffer, sourceMime, scene));

  return Response.json({ jobId: job.id });
}

async function runGeneration(jobId, sourceBuffer, sourceMime, scene) {
  try {
    const sourceUrl = await storeImage(`portraits/${jobId}/source`, sourceBuffer, sourceMime);
    await db.portraitJob.update({ where: { id: jobId }, data: { sourceUrl } });

    const provider = getAiPortraitProvider();
    const variants = await provider.generate({
      photo: sourceBuffer,
      mime: sourceMime,
      scene,
    });

    await Promise.all(
      variants.map(async (variant, index) => {
        const watermarked = await watermarkImage(variant.buffer);
        const [cleanUrl, watermarkedUrl] = await Promise.all([
          storeImage(`portraits/${jobId}/clean-${index}`, variant.buffer, variant.mime),
          storeImage(`portraits/${jobId}/preview-${index}`, watermarked, variant.mime),
        ]);
        return db.portraitPreview.create({
          data: {
            jobId,
            mime: variant.mime,
            cleanUrl,
            watermarkedUrl,
          },
        });
      }),
    );

    await db.portraitJob.update({
      where: { id: jobId },
      data: { status: "ready" },
    });
  } catch (error) {
    console.error("[portrait] generation failed", error);
    await db.portraitJob.update({
      where: { id: jobId },
      data: { status: "error", errorMessage: String(error?.message ?? error) },
    });
  }
}
