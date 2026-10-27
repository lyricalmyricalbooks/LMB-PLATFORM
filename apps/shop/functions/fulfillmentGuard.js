const { isPhysicalItem } = require("./shared/localFulfillment");
const { waitingPreorderLines, shipDateOf } = require("./shared/preorder");
// Kept in parity with admin/fulfillment.ts; money-spending label operations recheck fresh records.
// The admin stores these exact strings when the address is reviewed / items are packed.
const addressKey = order => {
 const address = order.customer?.address || {};
 const fields = ["street", "city", "state", "zip", "country"].map(key => String(address[key] || "").trim());
 const unit = String(address.unit || "").trim();
 return JSON.stringify(unit ? [...fields, unit] : fields);
};
const packingKey = order => JSON.stringify((order.items || []).map(i => [i.id || i.bookId || i.title, i.variantId || i.variant || "", i.quantity]));
function labelProblem(order, operations = {}) {
 if (['pickup', 'local_delivery'].includes(order.fulfillment?.method)) return 'This local fulfillment order does not use a carrier label.';
 if (order.isTest || order.paymentStatus !== "paid" || ["cancelled", "completed"].includes(order.status) || ["shipped", "out_for_delivery", "delivered", "cancelled", "refunded"].includes(order.fulfillmentStatus)) return "Only active paid, undispatched production orders can buy labels.";
 if (!(order.items || []).some(isPhysicalItem)) return "This order has no physical books to ship.";
 if (order.labelUrl) return "A label already exists. Reprint the existing label.";
 if (order.trackingSource === "inventory-app" && order.trackingNumber) return `A label was already bought in the inventory app (tracking ${order.trackingNumber}). Use that one, or press "Remove the inventory app label" on this order before buying another.`;
 if (operations.labelPurchasePending) return "A label purchase is pending. Check Shippo before attempting another purchase.";
 if (order.customerRequest?.type === "return" && order.customerRequest.status === "open") return "Resolve the active return before buying a fulfillment label.";
 if (order.disputeStatus && !["won", "lost", "warning_closed", "closed", "charge_refunded"].includes(String(order.disputeStatus))) return "This payment is disputed. Don't buy a label until the dispute is settled in Stripe.";
 if (operations.hold) return "Release the fulfillment hold before buying a label.";
 const waiting = waitingPreorderLines(order, operations);
 if (waiting.length) { const date = shipDateOf(waiting); return `This order includes a pre-order that releases ${date || "on a date not yet announced"}. Press "Ready to ship now" if the books have arrived.`; }
 if (operations.addressReviewed !== addressKey(order)) return "Review the address before buying a label.";
 if (operations.packed !== packingKey(order)) return "Complete the packing checklist before buying a label.";
 return "";
}
// A label bought in the inventory app for this order (functions/inventoryLinkJobs.js): may the website
// put its tracking on the order and dispatch it? The same checks as Orders › Dispatch (admin
// fulfillment.ts dispatchProblem, kept in parity by dispatchGuard.parity.test.ts) except the
// website's own address-review and packing steps, which the owner did in the inventory app.
const terminal = order => order.status === "cancelled" || ["refunded", "refund_pending"].includes(order.paymentStatus) || ["cancelled", "refunded"].includes(order.fulfillmentStatus);
const disputeOpen = order => !!order.disputeStatus && !["won", "lost", "warning_closed", "closed", "charge_refunded"].includes(String(order.disputeStatus));
const shippingMethod = order => ["pickup", "local_delivery"].includes(order.fulfillmentSelection?.method) ? order.fulfillmentSelection.method : "shipping";
const alreadyDispatched = order => ["shipped", "out_for_delivery", "delivered", "collected"].includes(order.fulfillmentStatus) || order.status === "completed";
function externalDispatchProblem(order, operations = {}) {
 if (!order) return "This order no longer exists on the website.";
 if (order.isTest) return "Test orders cannot be fulfilled.";
 if (terminal(order) || order.paymentStatus !== "paid") return "Only active paid orders can be dispatched.";
 if (!(order.items || []).some(item => item && item.giftCard !== true && isPhysicalItem(item))) return "This order has no physical books to ship.";
 if (shippingMethod(order) !== "shipping") return "Local pickup and delivery orders cannot use carrier dispatch.";
 if (alreadyDispatched(order)) return "This order has already been dispatched.";
 if (order.customerRequest?.type === "return" && order.customerRequest.status === "open") return "Resolve the active return before dispatching the order.";
 // Stricter than Orders › Dispatch: the owner can't see the customer's request from the inventory app.
 if (order.customerRequest?.status === "open") return "The customer asked to cancel this order. Answer their request in the website's Orders before shipping.";
 if (disputeOpen(order)) return "This payment is disputed. Don't ship until the dispute is settled in Stripe.";
 if (order.paymentStatus === "paid" && order.refund?.status === "failed") return "The refund for this order failed at the bank, so the customer was not refunded. Refund again or contact them before packing.";
 if (operations.hold) return `Order on hold: ${operations.hold}`;
 // Stricter than Orders › Dispatch: a website label purchase in progress (or waiting to be checked in Shippo)
 // would give the order a second paid label.
 if (operations.labelPurchasePending) return "The website is buying a label for this order (or a purchase is waiting to be checked in Shippo). Sort that out in the website's Orders first, so the order doesn't get two labels.";
 const waiting = waitingPreorderLines(order, operations);
 if (waiting.length) return `Pre-order: releases ${shipDateOf(waiting) || "on a date not yet announced"}. Press "Ready to ship now" if the books have arrived.`;
 return "";
}
// A Shippo label transaction that did not succeed. Only status "ERROR" is a definite
// refusal (nothing bought); QUEUED / WAITING may still turn into a paid label.
function shippoTransactionOutcome(transaction = {}) {
 const status = String(transaction?.status || "UNKNOWN");
 const reasons = (Array.isArray(transaction?.messages) ? transaction.messages : [])
  .map(m => String(m?.text || m?.message || "").trim()).filter(Boolean).join("; ");
 const definiteFailure = status === "ERROR";
 const message = definiteFailure
  ? `Shippo could not buy the label${reasons ? `: ${reasons}` : "."} Fix the problem and try again.`
  : `Shippo has not confirmed the label (status ${status})${reasons ? `: ${reasons}` : ""}. Check Shippo before trying again.`;
 return { status, definiteFailure, reasons, message };
}
// Order progress only moves forward. A late carrier update (or an owner who marked the order
// delivered before the carrier did) must never move it back or email the customer a step behind.
const TRACKING_RANK = { shipped: 1, out_for_delivery: 2, delivered: 3, collected: 3 };
function advancesTracking(previous, next) {
 const to = TRACKING_RANK[String(next || "")] || 0;
 const from = TRACKING_RANK[String(previous || "")] || 0;
 return to > from;
}
// Shippo answers 4xx when it refuses a request outright (bad rate, expired quote, invalid parcel,
// wrong key): nothing was bought. 408 and 5xx may have been processed, so they stay uncertain.
function shippoDefiniteRefusal(error) {
 const status = Number(error?.shippoStatus);
 return Number.isInteger(status) && status >= 400 && status < 500 && status !== 408;
}
module.exports = { labelProblem, externalDispatchProblem, addressKey, packingKey, shippoTransactionOutcome, advancesTracking, shippoDefiniteRefusal, terminal };
