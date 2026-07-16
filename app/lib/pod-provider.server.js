/**
 * @typedef {Object} PodOrderInput
 * @property {string} orderId - Shopify order ID (or name) that triggered the fulfillment.
 * @property {string} shop
 * @property {string} printFileUrl - URL of the clean, unwatermarked image (Vercel Blob). POD APIs take URLs directly.
 * @property {string} printFileMime
 * @property {string} variantId - Shopify variant ID of the frame/size the customer bought.
 * @property {number} quantity
 */

/**
 * @typedef {Object} PodOrderResult
 * @property {string} podOrderId
 * @property {string} status
 */

/**
 * @typedef {Object} PodProvider
 * @property {(input: PodOrderInput) => Promise<PodOrderResult>} createOrder
 * @property {(podOrderId: string) => Promise<{ status: string }>} getOrderStatus
 */

// TODO(pod): the client hasn't picked a POD vendor yet (candidates: Printful, Prodigi, Gelato,
// Printify — see project memory). Once chosen, add a new file (e.g. printful-provider.server.js)
// implementing this same interface and swap it in via getPodProvider(). Nothing else in the
// pipeline (webhook, checkout) should need to change.
/** @type {PodProvider} */
export const mockPodProvider = {
  async createOrder(input) {
    const podOrderId = `mock_${input.orderId}_${Date.now()}`;
    console.log(
      `[mock-pod] would submit order ${input.orderId} (shop ${input.shop}) ` +
        `variant ${input.variantId} x${input.quantity}, print file ${input.printFileUrl} (${input.printFileMime}) ` +
        `-> pod order ${podOrderId}`,
    );
    return { podOrderId, status: "submitted" };
  },

  async getOrderStatus(podOrderId) {
    return { status: "submitted" };
  },
};

export function getPodProvider() {
  return mockPodProvider;
}
