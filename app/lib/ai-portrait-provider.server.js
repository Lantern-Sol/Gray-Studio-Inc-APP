import sharp from "sharp";

/**
 * @typedef {Object} PortraitVariant
 * @property {Buffer} buffer
 * @property {string} mime
 */

/**
 * @typedef {Object} AiPortraitProvider
 * @property {(input: { photo: Buffer, mime: string, scene: string }) => Promise<PortraitVariant[]>} generate
 */

// ---------------------------------------------------------------------------
// fal.ai — ByteDance Seedream 4 (edit / image-to-image)
// Docs: https://fal.ai/models/fal-ai/bytedance/seedream/v4/edit
// ---------------------------------------------------------------------------

const FAL_QUEUE_URL = "https://queue.fal.run/fal-ai/bytedance/seedream/v4/edit";
const NUM_VARIANTS = 2; // previews per upload; each costs ~$0.03
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000;

const SCENE_PROMPTS = {
  paris:
    "Transform this photo into an elegant fine-art portrait of the exact same dog, " +
    "keeping its face, fur colors and markings faithful to the original. " +
    "Place the dog on a charming Parisian street at golden hour with the Eiffel Tower " +
    "softly visible in the background, Haussmann rooftops, warm romantic light, " +
    "painterly oil-painting style, gallery quality, high detail.",
  provence:
    "Transform this photo into an elegant fine-art portrait of the exact same dog, " +
    "keeping its face, fur colors and markings faithful to the original. " +
    "Place the dog in the lavender fields of Provence, rustic French countryside, " +
    "warm late-afternoon sunlight, rolling hills and a stone farmhouse in the distance, " +
    "painterly oil-painting style, gallery quality, high detail.",
};

function promptFor(scene) {
  return (
    SCENE_PROMPTS[scene] ??
    `Transform this photo into an elegant fine-art portrait of the exact same dog, ` +
      `keeping its face, fur colors and markings faithful to the original, in a ${scene} scene, ` +
      `painterly oil-painting style, gallery quality, high detail.`
  );
}

async function falFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`fal.ai request failed (${res.status}): ${body.slice(0, 500)}`);
  }
  return res.json();
}

/** @type {AiPortraitProvider} */
export const falSeedreamProvider = {
  async generate({ photo, scene }) {
    // Normalize the upload before sending: fix EXIF rotation and cap resolution so the
    // base64 payload stays well under fal's request size limit even for 10MB uploads.
    const prepped = await sharp(photo)
      .rotate()
      .resize(1536, 1536, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
    const dataUri = `data:image/jpeg;base64,${prepped.toString("base64")}`;

    const submitted = await falFetch(FAL_QUEUE_URL, {
      method: "POST",
      body: JSON.stringify({
        prompt: promptFor(scene),
        image_urls: [dataUri],
        num_images: NUM_VARIANTS,
        image_size: { width: 2048, height: 2048 },
        enable_safety_checker: true,
      }),
    });

    const statusUrl = submitted.status_url;
    const responseUrl = submitted.response_url;
    if (!statusUrl || !responseUrl) {
      throw new Error(`fal.ai queue submit returned no status/response URL: ${JSON.stringify(submitted).slice(0, 300)}`);
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    for (;;) {
      const status = await falFetch(statusUrl);
      if (status.status === "COMPLETED") break;
      if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
        throw new Error(`fal.ai job ended with status ${status.status}`);
      }
      if (Date.now() > deadline) {
        throw new Error("fal.ai generation timed out");
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    const result = await falFetch(responseUrl);
    const images = result.images ?? [];
    if (!images.length) {
      throw new Error(`fal.ai returned no images: ${JSON.stringify(result).slice(0, 300)}`);
    }

    return Promise.all(
      images.map(async (image) => {
        const res = await fetch(image.url);
        if (!res.ok) {
          throw new Error(`Failed to download generated image (${res.status})`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        return { buffer, mime: res.headers.get("content-type") ?? "image/jpeg" };
      }),
    );
  },
};

// ---------------------------------------------------------------------------
// Mock provider — used when FAL_KEY is not configured (demos, CI).
// ---------------------------------------------------------------------------

const SCENE_TINTS = {
  paris: { r: 200, g: 120, b: 60 },
  provence: { r: 120, g: 140, b: 90 },
};

function tintFor(scene) {
  return SCENE_TINTS[scene] ?? { r: 150, g: 150, b: 150 };
}

/** @type {AiPortraitProvider} */
export const mockAiPortraitProvider = {
  async generate({ photo, scene }) {
    // Simulate generation latency so the storefront loading state is exercised in demos.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const { r, g, b } = tintFor(scene);
    const variantSpecs = [
      { modulate: { brightness: 1, saturation: 1.15 }, tint: { r, g, b } },
      { modulate: { brightness: 1.08, saturation: 0.9 }, tint: { r: b, g: r, b: g } },
    ];

    const variants = await Promise.all(
      variantSpecs.map(async (spec) => {
        const buffer = await sharp(photo)
          .resize(1024, 1024, { fit: "cover" })
          .modulate(spec.modulate)
          .tint(spec.tint)
          .jpeg({ quality: 90 })
          .toBuffer();
        return { buffer, mime: "image/jpeg" };
      }),
    );

    return variants;
  },
};

export function getAiPortraitProvider() {
  return process.env.FAL_KEY ? falSeedreamProvider : mockAiPortraitProvider;
}
