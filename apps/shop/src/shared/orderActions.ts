// What the admin's money and order actions send to the server. The admin builds each body with these types and
// the Functions check every request against the same schema before touching an order (src/shared/edge.ts).
import { array, boolean, nullable, number, object, optional, string, type Infer } from "./edge";

/** An order's document id, as every order action names it (never a path). */
export const orderId = string({ min: 1, max: 200, pattern: /^[^/]+$/, label: "an order number" });

/** cancelOrder, resolvePaymentMismatch and restockRefunded (createStripeCheckoutSession `action`). */
export const orderActionBody = object({ orderId });
export type OrderActionBody = Infer<typeof orderActionBody>;

/**
 * refundOrder. Amount and restock rows keep their friendly checks in functions/partialRefund.js (above zero,
 * at most what is left, lines on the order); the schema only pins their types.
 */
export const refundOrderBody = object({
  orderId,
  reason: optional(string({ max: 2000 })),
  restock: optional(boolean()),
  amountMinor: optional(nullable(number({ int: true }))),
  restockLines: optional(nullable(array(object({ index: number({ int: true }), quantity: number({ int: true }) }), { max: 100 }))),
});
export type RefundOrderBody = Infer<typeof refundOrderBody>;
