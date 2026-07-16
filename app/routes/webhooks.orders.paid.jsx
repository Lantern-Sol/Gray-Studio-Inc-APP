import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getPodProvider } from "../lib/pod-provider.server";

export async function action({ request }) {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const order = payload;
  const podProvider = getPodProvider();

  for (const lineItem of order.line_items ?? []) {
    const properties = Object.fromEntries(
      (lineItem.properties ?? []).map((prop) => [prop.name, prop.value]),
    );
    const previewId = properties._pp_preview_id;
    if (!previewId) continue;

    const preview = await db.portraitPreview.findUnique({
      where: { id: previewId },
      include: { job: true },
    });

    if (!preview || preview.job.shop !== shop) {
      console.warn(`[orders/paid] preview ${previewId} not found for shop ${shop}`);
      continue;
    }

    try {
      const result = await podProvider.createOrder({
        orderId: String(order.id ?? order.name),
        shop,
        printFileUrl: preview.cleanUrl,
        printFileMime: preview.mime,
        variantId: String(lineItem.variant_id),
        quantity: lineItem.quantity ?? 1,
      });
      console.log(
        `[orders/paid] submitted preview ${previewId} to POD -> ${result.podOrderId} (${result.status})`,
      );
    } catch (error) {
      console.error(`[orders/paid] POD handoff failed for preview ${previewId}`, error);
    }
  }

  return new Response();
}
