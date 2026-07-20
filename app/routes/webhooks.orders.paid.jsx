import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getPodProvider } from "../lib/pod-provider.server";

export async function action({ request }) {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const order = payload;
  const podProvider = getPodProvider();
  const orderId = String(order.id ?? order.name);
  const orderName = order.name ? String(order.name) : null;

  for (const lineItem of order.line_items ?? []) {
    const properties = Object.fromEntries(
      (lineItem.properties ?? []).map((prop) => [prop.name, prop.value]),
    );
    const previewId = properties._pp_preview_id;
    if (!previewId) continue; // not a portrait line item

    const logBase = {
      shop,
      orderId,
      orderName,
      variantId: lineItem.variant_id ? String(lineItem.variant_id) : null,
      quantity: lineItem.quantity ?? 1,
      previewId,
      scene: properties._pp_scene ?? null,
    };

    const preview = await db.portraitPreview.findUnique({
      where: { id: previewId },
      include: { job: true },
    });

    if (!preview || preview.job.shop !== shop) {
      console.warn(`[orders/paid] preview ${previewId} not found for shop ${shop}`);
      await db.podOrderLog.create({
        data: {
          ...logBase,
          status: "skipped_no_preview",
          errorMessage: `Preview ${previewId} not found for this shop`,
        },
      });
      continue;
    }

    try {
      const result = await podProvider.createOrder({
        orderId,
        shop,
        printFileUrl: preview.cleanUrl,
        printFileMime: preview.mime,
        variantId: String(lineItem.variant_id),
        quantity: lineItem.quantity ?? 1,
      });
      console.log(
        `[orders/paid] submitted preview ${previewId} to POD -> ${result.podOrderId} (${result.status})`,
      );
      await db.podOrderLog.create({
        data: {
          ...logBase,
          printFileUrl: preview.cleanUrl,
          podOrderId: result.podOrderId,
          status: result.status ?? "submitted",
        },
      });
    } catch (error) {
      console.error(`[orders/paid] POD handoff failed for preview ${previewId}`, error);
      await db.podOrderLog.create({
        data: {
          ...logBase,
          printFileUrl: preview.cleanUrl,
          status: "error",
          errorMessage: String(error?.message ?? error),
        },
      });
    }
  }

  return new Response();
}
