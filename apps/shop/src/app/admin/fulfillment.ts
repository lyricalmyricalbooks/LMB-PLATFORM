import { addressMissing, regionRequired, postalRequired } from "../features/site/addressRules";
import { cleanTrackingLink } from "../lib/tracking";
import { waitingPreorderLines, shipDateOf } from "../features/site/preorder";
// Publisher workflow state is private; public order/payment records remain authoritative.
export const WORK_QUEUES = ["Needs attention", "Ready to pack", "Ready to ship", "Ready for pickup", "Ready for local delivery", "Awaiting release", "In transit", "Completed", "Unpaid", "All orders"];
export const terminal = (o: any) => o.status === "cancelled" || ["refunded", "refund_pending"].includes(o.paymentStatus) || ["cancelled", "refunded"].includes(o.fulfillmentStatus);
// Firestore does not guarantee map key order. Compare the address fields that
// drive shipping in a fixed order so equivalent addresses do not look stale.
export const addressKey = (o: any) => {
 const address = o.customer?.address || {};
 const fields = ["street", "city", "state", "zip", "country"].map(key => String(address[key] || "").trim());
 const unit = String(address.unit || "").trim();
 return JSON.stringify(unit ? [...fields, unit] : fields);
};
export const packingKey = (o: any) => JSON.stringify((o.items || []).map((i: any) => [i.id || i.bookId || i.title, i.variantId || i.variant || "", i.quantity]));
export function addressIssues(o: any): string[] {
 const a = o.customer?.address || {};
 const issues: string[] = [];
 // Only the boxes this country uses: no province outside Canada/US, no postal code where there is none.
 if (addressMissing(a).length) issues.push("Complete the street, city, country" + (regionRequired(a.country) ? ", province/state" : "") + (postalRequired(a.country) ? " and postal code." : "."));
 const country = String(a.country || "").trim().toUpperCase();
 const ca = ["CA", "CANADA"].includes(country);
 const us = ["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(country);
 const province = String(a.state || "").trim().toUpperCase();
 const canadian = /^(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT|ONTARIO|QUEBEC|BRITISH COLUMBIA|ALBERTA|MANITOBA|SASKATCHEWAN|NOVA SCOTIA|NEW BRUNSWICK|NEWFOUNDLAND AND LABRADOR|PRINCE EDWARD ISLAND|YUKON|NUNAVUT|NORTHWEST TERRITORIES)$/.test(province);
 const postal = String(a.zip || "").replace(/\s/g, "").toUpperCase();
 if (us && (canadian || /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(postal))) issues.push("The country conflicts with a Canadian province or postal code. Correct the address with the customer.");
 if (ca && (!canadian || !/^[ABCEGHJ-NPRSTVXY]\d[A-Z]\d[A-Z]\d$/.test(postal))) issues.push("Check the Canadian province and postal code.");
 if (us && !/^\d{5}(-\d{4})?$/.test(postal)) issues.push("Check the US ZIP code.");
 if (o.addressVerified === false) issues.push(o.addressError === "verification_unavailable"
   ? "The address checker was unavailable when this order was placed. Confirm the address before shipping."
   : o.addressError || "Postal verification failed. Confirm the address with the customer.");
 return issues;
}
// Gift cards are emailed (never packed or shipped), like e-books.
export const isDigitalItem = (i: any) => i?.digital === true || i?.isDigital === true || i?.giftCard === true || i?.productType === "giftCard" || /digital|e-book|ebook|epub|pdf|audiobook/.test(String(i?.format || "").toLowerCase());
export const physicalItems = (o: any) => (o.items || []).filter((i: any) => !isDigitalItem(i));
export const fulfillmentMethod = (o: any) => ["pickup", "local_delivery"].includes(o.fulfillmentSelection?.method) ? o.fulfillmentSelection.method : "shipping";
export function queueOf(o: any): string {
 // Money that arrived after the order was cancelled was not accepted: refund it.
 if (o.paymentMismatch?.paidAfterCancel && !o.paymentMismatch?.resolvedAt && o.paymentStatus !== "paid") return "Needs attention";
 if (terminal(o)) return "Completed";
 // The customer asked to cancel or return: answer before packing anything.
 if (o.customerRequest?.status === "open") return "Needs attention";
 // A payment that didn't match the order total (amount or currency) was not accepted: review it.
 if (o.paymentMismatch && !o.paymentMismatch.resolvedAt && o.paymentStatus !== "paid") return "Needs attention";
 // A payment arrived but a gift card could no longer cover its part: the order was not marked paid.
 if (o.giftCardConflict && !o.giftCardConflict.resolvedAt && o.paymentStatus !== "paid") return "Needs attention";
 if (o.paymentStatus !== "paid") return "Unpaid";
 if (o.items?.length && !physicalItems(o).length) return "Completed";
 const method = fulfillmentMethod(o);
 if (["delivered", "collected"].includes(o.fulfillmentStatus)) return "Completed";
 if (o.fulfillmentStatus === "out_for_delivery" || (method === "shipping" && o.fulfillmentStatus === "shipped") || o.status === "completed") return "In transit";
 // An open chargeback on an order not yet sent or handed over: hold the books until it is
 // settled. Sent parcels stay In transit so delivery proof and tracking can still be recorded.
 if (disputeOpen(o)) return "Needs attention";
 // A refund the bank rejected: the customer thinks they were refunded. Refund again or contact them before packing.
 if (refundFailed(o)) return "Needs attention";
 // Paid pre-orders wait here until their release date (or "Ready to ship now"), then join the
 // normal queues by themselves. A hold or address problem is still dealt with on release.
 if (awaitingRelease(o) && !["ready_for_pickup", "ready_for_delivery"].includes(o.fulfillmentStatus)) return "Awaiting release";
 if (o.fulfillmentStatus === "ready_for_pickup") return "Ready for pickup";
 if (o.fulfillmentStatus === "ready_for_delivery") return "Ready for local delivery";
 const needsAddressReview = method !== "pickup" && (addressIssues(o).length || o.operations?.addressReviewed !== addressKey(o));
 if (!o.items?.length || o.isTest || o.operations?.hold || needsAddressReview) return "Needs attention";
 if (o.operations?.packed !== packingKey(o)) return "Ready to pack";
 return method === "pickup" ? "Ready for pickup" : method === "local_delivery" ? "Ready for local delivery" : "Ready to ship";
}
/** Physical pre-order lines still waiting for their release date (see features/site/preorder.ts). */
export const awaitingRelease = (o: any) => waitingPreorderLines(o, o?.operations || {}).length > 0;
/** The date a waiting pre-order order can ship ("" = not announced yet). */
export const preorderShipDate = (o: any) => shipDateOf(waitingPreorderLines(o, o?.operations || {}));
/** A card dispute the shop hasn't won or closed yet. */
/** A refund the bank rejected after it was accepted: the order is paid again but the customer was told it was refunded. */
export const refundFailed = (o: any) => o?.paymentStatus === "paid" && o?.refund?.status === "failed";
export const disputeOpen = (o: any) => !!o?.disputeStatus && !["won", "lost", "warning_closed", "closed", "charge_refunded"].includes(String(o.disputeStatus));
// Books that already left the shop (sent, out for delivery, delivered, collected) aren't back on
// the shelf, so a refund only restocks them by default before dispatch or hand-over.
// Same rule as the server's refund default (functions/refundRestock.js leftTheShop, parity-tested).
export const LEFT_THE_SHOP_STATUSES = ["shipped", "out_for_delivery", "delivered", "collected", "completed"];
export const defaultRestockOnRefund = (o: any) => !LEFT_THE_SHOP_STATUSES.includes(String(o?.fulfillmentStatus || "")) && o?.status !== "completed";
/** A refunded order whose printed books were never put back in stock (Order detail › Put the books back in stock). */
export const booksLeftOutAfterRefund = (o: any) => ["refunded", "refund_pending"].includes(o?.paymentStatus)
  && o?.inventoryRestockedAt == null
  && o?.sandboxPayment !== true
  && (o?.items || []).some((item: any) => item && !isDigitalItem(item) && Number(item.quantity) > 0);
export function dispatchProblem(o: any): string {
 if (o.isTest) return "Test orders cannot be fulfilled.";
 if (terminal(o) || o.paymentStatus !== "paid") return "Only active paid orders can be dispatched.";
 const q = queueOf(o);
 if (fulfillmentMethod(o) !== "shipping") return "Local pickup and delivery orders cannot use carrier dispatch.";
 if (q === "In transit" || q === "Completed") return "This order has already been dispatched.";
 if (o.customerRequest?.type === "return" && o.customerRequest.status === "open") return "Resolve the active return before dispatching the order.";
 if (disputeOpen(o)) return "This payment is disputed. Don't ship until the dispute is settled in Stripe.";
 if (refundFailed(o)) return "The refund for this order failed at the bank, so the customer was not refunded. Refund again or contact them before packing.";
 if (o.operations?.hold) return `Order on hold: ${o.operations.hold}`;
 if (q === "Awaiting release") return `Pre-order: releases ${preorderShipDate(o) || "on a date not yet announced"}. Press "Ready to ship now" if the books have arrived.`;
 if (addressIssues(o).length || o.operations?.addressReviewed !== addressKey(o)) return "Review and confirm the shipping address first.";
 if (o.operations?.packed !== packingKey(o)) return "Complete the packing checklist first.";
 return "";
}
/**
 * "What's blocking this" for an order in Needs attention for a reason other than its address
 * (dispute, hold, test order, return, no items…). "" when the address step already explains it.
 */
export function blockingProblem(o: any): string {
 if (queueOf(o) !== "Needs attention") return "";
 if (!o.items?.length) return "This order has no items. Resolve the order data before fulfillment.";
 const problem = dispatchProblem(o);
 if (!problem || /address|packing checklist/i.test(problem)) return "";
 if (/already been dispatched|Local pickup/.test(problem)) return "";
 return problem;
}
/** A cash / e-Transfer (manual) order still waiting for its money: the admin may mark it paid. */
export function canMarkManualPaid(o: any): boolean {
 if (!o || ["paid", "refunded", "refund_pending"].includes(o.paymentStatus) || o.status === "cancelled" || o.status === "refunded") return false;
 if (o.stripePaymentIntentId || o.stripeCheckoutSessionId || o.paypalOrderId || o.paypalCaptureId) return false;
 const method = String(o.paymentMethod || "").toLowerCase();
 if (!method || /stripe|card|paypal|apple|google|free/.test(method)) return false;
 return Number(o.total) > 0;
}
/** Address fields the server refuses to change on this paid order, and why (see api.correctOrderAddress). */
export function lockedAddressFields(o: any): { fields: string[]; reason: string } {
 if (fulfillmentMethod(o) === "local_delivery") return { fields: ["state", "zip", "country"], reason: "For a paid local delivery, province, postal code and country can't change. Cancel and refund this order, then place a new one for the new area." };
 return { fields: ["state", "country"], reason: "Shipping and tax were charged for the original country and province, so those can't change. Fix the street, city or postal code, or refund the order and have the customer order again." };
}
/** sessionStorage key for the packing checklist ticks (changes when the items change). */
export const packingTicksKey = (o: any) => `packing-ticks:${o?.id || o?.orderId || ""}:${packingKey(o || {})}`;
// Carrier, tracking number and optional tracking link typed by the publisher
// (for parcels sent without a Shippo label). The link replaces the built-in
// carrier page in emails, the customer account and order tracking.
export function trackingFields(payload: any) {
 const trackingCarrier = String(payload?.trackingCarrier || "").trim().slice(0, 80);
 const trackingNumber = String(payload?.trackingNumber || "").trim().slice(0, 100);
 if (!trackingCarrier || !trackingNumber) throw new Error("Enter the carrier and tracking number.");
 const raw = String(payload?.trackingUrl || "").trim();
 const trackingUrl = cleanTrackingLink(raw);
 if (raw && !trackingUrl) throw new Error("The tracking link must start with https://");
 return { trackingCarrier, trackingNumber, trackingUrl };
}
// The checkout saves live carrier choices as "<provider> <service>" (e.g.
// "Canada Post Expedited Parcel"); label rates name only the service.
const serviceName = (name: unknown) => String(name || "").toLowerCase().replace(/^\s*canada post\s*/, "").replace(/[^a-z0-9]+/g, " ").trim();
export function matchesCustomerService(rateName: unknown, shippingMethod: unknown): boolean {
 const rate = serviceName(rateName);
 const chosen = serviceName(shippingMethod);
 return !!rate && !!chosen && rate === chosen;
}
// Shipped parcels still not delivered after this many days get flagged so lost ones are chased early.
export const OVERDUE_TRANSIT_DAYS = 14;
export function daysInTransit(o: any, now: number = Date.now()): number | null {
 if (fulfillmentMethod(o) !== "shipping" || queueOf(o) !== "In transit") return null;
 const shipped = Date.parse(o.shippedAt || "");
 if (!Number.isFinite(shipped)) return null;
 return Math.max(0, Math.floor((now - shipped) / 86400000));
}
export const isOverdueInTransit = (o: any, now?: number) => (daysInTransit(o, now) ?? 0) >= OVERDUE_TRANSIT_DAYS;
// Default parcel weight for the label dialog: catalog weights saved on the order
// (grams per copy) plus packaging, in whole grams. Copies without a weight count as 680 g.
export const PACKAGING_GRAMS = 150;
export function suggestedParcelWeightGrams(o: any): string {
 const grams = physicalItems(o).reduce((sum: number, item: any) => {
  const each = Number(item.weightGrams);
  return sum + (Number.isFinite(each) && each > 0 ? each : 680) * Math.max(1, Number(item.quantity || 1));
 }, 0);
 if (!grams) return "680";
 return String(Math.max(1, Math.round(grams + PACKAGING_GRAMS)));
}
// Copies to pull from the shelves for these orders. A box set counts the books inside it
// (each set × each book's quantity), so the pick list matches what actually goes in the parcel.
export function buildPickList(orders: any[]) {
 const items = new Map<string, any>();
 const add = (line: any, quantity: number) => {
  const key = JSON.stringify([line.id || line.bookId || line.title, line.variantId || line.variant || ""]);
  const entry = items.get(key) || { ...line, addOns: undefined, components: undefined, promoGift: undefined, quantity: 0, addOnCounts: {} as Record<string, number> };
  entry.quantity += quantity;
  // Merged lines keep a tally of their add-ons ("Signed copy" × 2) instead of the first line's choice.
  for (const a of Array.isArray(line.addOns) ? line.addOns : []) if (a?.label) entry.addOnCounts[a.label] = (entry.addOnCounts[a.label] || 0) + quantity;
  items.set(key, entry);
 };
 for (const o of orders) for (const i of physicalItems(o)) {
  const sets = Number(i.quantity || 0);
  if (Array.isArray(i.components) && i.components.length) {
   for (const part of i.components) {
    if (!part) continue;
    add({ id: part.id, variantId: part.variantId || "", title: part.title || part.id, variantName: part.variantName || "", sku: part.sku || "" }, sets * Math.max(1, Number(part.quantity) || 1));
   }
  } else add(i, sets);
 }
 return [...items.values()];
}


// What the packing checklist shows for one order line: the book's current cover
// (catalog first, then the photo saved on the order) and where it sits on the shelf.
export function packingInfo(item: any, book: any): { photo: string; shelf: string } {
  const b = book || {};
  const variant = (b.variants || []).find((v: any) => v && (
    (item?.variantId && v.id === item.variantId) || (item?.variantName && v.name === item.variantName)));
  const photo = [variant?.image, variant?.photoUrl, b.coverImage, b.photos?.[0], b.image, item?.photoUrl]
    .find((x) => typeof x === "string" && x.trim()) || "";
  const shelf = String(variant?.shelfLocation || b.shelfLocation || "").trim();
  return { photo, shelf };
}
