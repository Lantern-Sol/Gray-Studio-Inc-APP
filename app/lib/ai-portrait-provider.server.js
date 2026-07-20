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
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000;

// How many preview options each upload generates (~$0.03/image).
// Set to 2 to bring back the two-scene choice (balcony/café, lavender/village).
const PREVIEW_COUNT = 1;

const IDENTITY_PREFIX =
  "Transform this photo into an elegant fine-art portrait of the exact same dog, " +
  "keeping its face, fur colors and markings faithful to the original. ";

// Each scene gets two deliberately different prompts so the customer's preview
// options feel like a real choice (one fal request per prompt, ~$0.03 each).
const SCENE_PROMPTS = {
  paris: [
    IDENTITY_PREFIX +
      "Place the dog on a Parisian balcony at golden hour with the Eiffel Tower " +
      "softly visible in the background, Haussmann rooftops, warm romantic light, " +
      "painterly oil-painting style, gallery quality, high detail.",
    IDENTITY_PREFIX +
      "Place the dog seated outside a charming Parisian café on a cobblestone street " +
      "in soft morning daylight, pastel tones, bistro chairs and flower boxes around, " +
      "impressionist painting style, gallery quality, high detail.",
  ],
  provence: [
    IDENTITY_PREFIX +
      "Place the dog in the lavender fields of Provence at warm late-afternoon light, " +
      "rolling purple hills and a stone farmhouse in the distance, " +
      "painterly oil-painting style, gallery quality, high detail.",
    IDENTITY_PREFIX +
      "Place the dog in a rustic Provençal village square in soft daylight, " +
      "sunflowers and ochre stone houses, shuttered windows, market morning atmosphere, " +
      "impressionist painting style, gallery quality, high detail.",
  ],
};

function promptsFor(scene) {
  return (
    SCENE_PROMPTS[scene] ?? [
      IDENTITY_PREFIX +
        `Place the dog in a ${scene} scene, painterly oil-painting style, gallery quality, high detail.`,
      IDENTITY_PREFIX +
        `Place the dog in a ${scene} scene from a different angle and time of day, ` +
        `impressionist painting style, gallery quality, high detail.`,
    ]
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

async function falGenerateOne(prompt, dataUri) {
  const submitted = await falFetch(FAL_QUEUE_URL, {
    method: "POST",
    body: JSON.stringify({
      prompt,
      image_urls: [dataUri],
      num_images: 1,
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
  const image = result.images?.[0];
  if (!image) {
    throw new Error(`fal.ai returned no images: ${JSON.stringify(result).slice(0, 300)}`);
  }

  const res = await fetch(image.url);
  if (!res.ok) {
    throw new Error(`Failed to download generated image (${res.status})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mime: res.headers.get("content-type") ?? "image/jpeg" };
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

    // Distinct prompts generated in parallel — with PREVIEW_COUNT 2 the customer
    // picks between genuinely different scenes rather than near-duplicate variations.
    return Promise.all(
      promptsFor(scene)
        .slice(0, PREVIEW_COUNT)
        .map((prompt) => falGenerateOne(prompt, dataUri)),
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
      variantSpecs.slice(0, PREVIEW_COUNT).map(async (spec) => {
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
