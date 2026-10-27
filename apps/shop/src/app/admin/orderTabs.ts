// Shopify-style work queues for the Orders list. Pure helpers.
export type OrderTab = "To ship" | "Unpaid" | "Open" | "Completed" | "All orders";
export const ORDER_TABS: OrderTab[] = ["To ship", "Unpaid", "Open", "Completed", "All orders"];

const SHIPPED = new Set(["shipped", "out_for_delivery", "delivered", "cancelled", "refunded"]);

export function fulfillmentOf(o: any): string {
  return o.fulfillmentStatus || (o.status === "completed" ? "delivered" : o.paymentStatus === "paid" ? "paid" : "pending_payment");
}

export function matchesOrderTab(o: any, tab: string): boolean {
  switch (tab) {
    case "To ship": return o.paymentStatus === "paid" && o.status !== "cancelled" && !SHIPPED.has(fulfillmentOf(o));
    case "Unpaid": return o.paymentStatus !== "paid" && o.paymentStatus !== "refunded" && o.paymentStatus !== "refund_pending" && o.status !== "cancelled";
    case "Open": return o.status === "open";
    case "Completed": return o.status === "completed";
    default: return true;
  }
}
