// What a customer should be told about their order, shared by the tracking
// page, the account order list and the thank-you page. Words come from Studio
// copy keys; this file only decides which one applies.
import { trackingStepIndex } from "./fulfillmentTracking";

export type OrderStage = "awaiting_payment" | "cancelled" | "refunded" | "active";

export function orderStage(o: any): OrderStage {
  if (!o) return "active";
  if (["refunded", "refund_pending"].includes(o.paymentStatus) || o.fulfillmentStatus === "refunded") return "refunded";
  if (o.status === "cancelled" || o.fulfillmentStatus === "cancelled") return "cancelled";
  if (o.paymentStatus !== "paid") return "awaiting_payment";
  return "active";
}

const methodOf = (o: any) => o?.fulfillmentSelection?.method || o?.fulfillment?.method || "shipping";

// The timeline step (0 placed/paid … 3 delivered). Dispatch also stamps
// status "completed", so the fulfillment status decides, not the order status.
export function orderStep(o: any): number {
  return trackingStepIndex(methodOf(o), String(o?.fulfillmentStatus || o?.status || ""));
}

// When each timeline step happened, if recorded.
export function stepDates(o: any): (string | undefined)[] {
  const method = methodOf(o);
  if (method === "pickup") return [o?.paidAt || o?.createdAt, undefined, o?.readyForPickupAt, o?.collectedAt];
  if (method === "local_delivery") return [o?.paidAt || o?.createdAt, o?.readyForDeliveryAt, o?.outForDeliveryAt, o?.deliveredAt];
  return [o?.paidAt || o?.createdAt, undefined, o?.shippedAt, o?.deliveredAt];
}

// The copy key for a short status badge (account list).
export function statusCopyKey(o: any): string {
  const stage = orderStage(o);
  if (stage === "refunded") return "accountRefunded";
  if (stage === "cancelled") return "accountCancelled";
  if (stage === "awaiting_payment") return "accountAwaitingPayment";
  const fs = o?.fulfillmentStatus;
  if (["delivered", "collected"].includes(fs)) return fs === "collected" ? "trackCollected" : "accountDelivered";
  if (fs === "out_for_delivery") return "trackOutForDelivery";
  if (fs === "shipped") return "accountShipped";
  if (fs === "ready_for_pickup") return "trackPickupReady";
  if (fs === "ready_for_delivery") return "trackReadyForDelivery";
  if (fs === "processing") return "accountProcessing";
  // Paid, digital-only orders are complete once paid.
  if (o?.status === "completed" && !fs) return "accountDelivered";
  return "accountUnfulfilled";
}

export const statusTone = (o: any): "success" | "info" | "warning" | "danger" => {
  const key = statusCopyKey(o);
  if (["accountDelivered", "trackCollected"].includes(key)) return "success";
  if (["accountRefunded", "accountCancelled"].includes(key)) return "danger";
  if (["accountShipped", "trackOutForDelivery", "trackPickupReady"].includes(key)) return "info";
  return "warning";
};

// Carrier days ("3", "3-7") for shipped orders; null when nothing was quoted.
export function shippingDays(o: any): string | null {
  const days = String(o?.shippingEstimate?.days ?? "").trim();
  return days || null;
}

// Link that opens this order on /track without retyping it.
export function trackLink(o: any): string {
  // The Firestore document ID is what the lookup reads.
  const id = encodeURIComponent(o?.id || o?.orderId || "");
  const key = typeof o?.trackingKey === "string" ? `&key=${encodeURIComponent(o.trackingKey)}` : "";
  return `/track?orderId=${id}${key}`;
}
