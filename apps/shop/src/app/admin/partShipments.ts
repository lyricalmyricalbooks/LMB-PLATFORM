// Ship part of an order now and the rest later (code plan 24.5). Pure rules for Orders › order › Send part now
// (FulfillmentWorkbench) and api.fulfillmentAction("ship_part"): which lines can still go, how much of each, and when a
// part shipment is refused. A part shipment is recorded on the order as `partShipments` (public, so the customer's
// tracking page lists each parcel) and never changes the order's status: the order is "shipped" only when the rest
// goes with the normal dispatch.
import { addressIssues, addressKey, copiesTakenOff, disputeOpen, fulfillmentMethod, isDigitalItem, queueOf, refundFailed, reviewOpen, REVIEW_PROBLEM, terminal } from "./fulfillment";

export interface PartShipmentLine { line: number; title: string; quantity: number }
export interface PartShipment {
  id: string; lines: PartShipmentLine[];
  trackingCarrier: string; trackingNumber: string; trackingUrl: string; shippedAt: string;
}
export interface ShippableLine { line: number; title: string; ordered: number; sent: number; left: number }

/** A part's lines, as saved: only whole positive quantities on real lines. */
export function partShipmentsOf(o: any): PartShipment[] {
  return Array.isArray(o?.partShipments) ? o.partShipments.filter((p: any) => p && Array.isArray(p.lines)) : [];
}

const lineTitle = (item: any) => [String(item?.title || "Item"), String(item?.variantName || "").trim()].filter(Boolean).join(" – ");

/** Every physical line with how many were ordered, how many already went in a part, and how many are left. */
export function shippableLines(o: any): ShippableLine[] {
  const sent = new Map<number, number>();
  for (const part of partShipmentsOf(o)) for (const l of part.lines) sent.set(l.line, (sent.get(l.line) || 0) + Math.max(0, Math.floor(Number(l.quantity) || 0)));
  const out: ShippableLine[] = [];
  (Array.isArray(o?.items) ? o.items : []).forEach((item: any, line: number) => {
    if (!item || isDigitalItem(item)) return;
    const ordered = Math.max(0, Math.floor(Number(item.quantity) || 0));
    if (!ordered) return;
    const already = Math.min(ordered, sent.get(line) || 0);
    // Copies taken off the order (partial refund that restocked them) are not sent either.
    const takenOff = Math.min(ordered - already, copiesTakenOff(o, line));
    out.push({ line, title: lineTitle(item), ordered, sent: already, left: ordered - already - takenOff });
  });
  return out;
}

/** True once some of the order has gone in a part shipment. */
export const hasPartShipments = (o: any) => partShipmentsOf(o).length > 0;

/**
 * Why this part can't go now, or "". `picks` maps a line number (its place in the order's items) to the copies sent.
 * Like dispatch it needs a paid, active, carrier-shipped order with a reviewed address and no hold, dispute, open
 * return or risky-payment check. Unlike dispatch it is allowed before the packing checklist is done and while a
 * pre-order waits for its release, since sending what is ready is the point. It must leave something for later:
 * sending everything is the normal dispatch.
 */
export function partShipmentProblem(o: any, picks: Record<string | number, unknown>): string {
  if (o?.isTest) return "Test orders cannot be fulfilled.";
  if (terminal(o) || o?.paymentStatus !== "paid") return "Only active paid orders can be sent.";
  if (fulfillmentMethod(o) !== "shipping") return "Pickup and local delivery orders are handed over in one go.";
  const q = queueOf(o);
  if (q === "In transit" || q === "Completed") return "This order has already been dispatched.";
  if (o.customerRequest?.status === "open") return "Answer the customer's cancel or return request first.";
  if (disputeOpen(o)) return "This payment is disputed. Don't ship until the dispute is settled.";
  if (refundFailed(o)) return "The refund for this order failed at the bank. Refund again or contact the customer before shipping.";
  if (reviewOpen(o)) return REVIEW_PROBLEM;
  if (o.operations?.hold) return `Order on hold: ${o.operations.hold}`;
  if (addressIssues(o).length || o.operations?.addressReviewed !== addressKey(o)) return "Review and confirm the shipping address first.";
  const lines = shippableLines(o);
  let sending = 0;
  for (const [key, raw] of Object.entries(picks || {})) {
    const qty = Number(raw);
    if (!qty) continue;
    if (!Number.isInteger(qty) || qty < 0) return "Enter whole numbers of copies.";
    const line = lines.find((l) => l.line === Number(key));
    if (!line) return "One of the items can't be shipped (it's digital or no longer on the order). Reload the order.";
    if (qty > line.left) return `Only ${line.left} of ${line.title} ${line.left === 1 ? "is" : "are"} left to send.`;
    sending += qty;
  }
  if (!sending) return "Choose at least one item to send now.";
  const left = lines.reduce((n, l) => n + l.left, 0);
  if (sending >= left) return "That's everything left on the order. Use Mark as shipped instead, so the order is marked shipped.";
  return "";
}

/** The part to save, from checked picks and tracking fields already cleaned by trackingFields(). */
export function newPartShipment(o: any, picks: Record<string | number, unknown>, tracking: { trackingCarrier: string; trackingNumber: string; trackingUrl: string }, now: string): PartShipment {
  const lines = shippableLines(o);
  const parts = partShipmentsOf(o);
  return {
    id: `p${parts.length + 1}`,
    lines: lines.filter((l) => Number(picks[l.line]) > 0).map((l) => ({ line: l.line, title: l.title, quantity: Number(picks[l.line]) })),
    trackingCarrier: tracking.trackingCarrier, trackingNumber: tracking.trackingNumber, trackingUrl: tracking.trackingUrl || "",
    shippedAt: now,
  };
}

/** Whether Send part now is offered: one copy of the first unsent line could go now and leave something for later. */
export function canShipPart(o: any): boolean {
  const first = shippableLines(o).find((l) => l.left > 0);
  return !!first && partShipmentProblem(o, { [first.line]: 1 }) === "";
}
