export type LocalFulfillmentMethod = "pickup" | "local_delivery";

export function trackingStepIndex(method: string | undefined, status: string | undefined): number {
  const current = String(status || "").toLowerCase();
  if (method === "pickup") {
    if (current === "collected") return 3;
    if (current === "ready_for_pickup") return 2;
    if (["processing", "open"].includes(current)) return 1;
    return 0;
  }
  if (method === "local_delivery") {
    if (current === "delivered") return 3;
    if (current === "out_for_delivery") return 2;
    if (["ready_for_delivery", "processing", "open"].includes(current)) return 1;
    return 0;
  }
  if (current === "delivered" || current === "completed") return 3;
  if (current === "shipped" || current === "out_for_delivery") return 2;
  if (["processing", "open"].includes(current)) return 1;
  return 0;
}
