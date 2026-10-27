// Voiding (refunding) a Shippo label bought from Orders. Pure rules shared by `createShippingLabel`
// (mode "voidLabel") and the 15-minute follow-up in `unpaidPaymentSweep`; mirrored for the admin in
// src/app/admin/labelRefunds.ts (labelVoid.parity.test.ts).
//
// Shippo refunds unused labels bought in the last 90 days. A refund request goes QUEUED/PENDING
// (Shippo waits for the carrier, up to ~14 business days) and ends SUCCESS (refunded) or ERROR
// (rejected: the carrier scanned or used the label).

// A parcel that has left the shop: its label is in use, so it is never voided from here. A cancelled or
// refunded order whose parcel never left keeps an unused label that can (and should) be refunded.
const HANDED_OVER = ["shipped", "out_for_delivery", "delivered", "picked_up", "collected"];
function labelHandedOver(order = {}) {
  return !!order.shippedAt || HANDED_OVER.includes(String(order.fulfillmentStatus || "").toLowerCase()) || order.status === "completed";
}

// Shippo's refund object (refunds/) and transaction statuses → one of pending | refunded | rejected.
function refundStateOf(status) {
  const s = String(status || "").toUpperCase();
  if (s === "SUCCESS" || s === "REFUNDED") return "refunded";
  if (s === "ERROR" || s === "REFUNDREJECTED") return "rejected";
  if (["QUEUED", "PENDING", "REFUNDPENDING", "WAITING"].includes(s)) return "pending";
  return null;
}

// What a transaction already says about a refund (so a second request is never sent).
function transactionRefundState(transaction) {
  const s = String(transaction?.status || transaction?.object_status || "").toUpperCase();
  return ["REFUNDED", "REFUNDPENDING", "REFUNDREJECTED"].includes(s) ? refundStateOf(s) : null;
}

// Labels bought before the transaction id was saved: find the bought label by its tracking number.
function findLabelTransaction(transactions, trackingNumber) {
  const wanted = String(trackingNumber || "").replace(/\s+/g, "");
  if (!wanted) return null;
  return (transactions || []).find(t => String(t?.tracking_number || "").replace(/\s+/g, "") === wanted
    && String(t?.status || "").toUpperCase() !== "ERROR") || null;
}

const REFUND_WINDOW_DAYS = 90;
const STALE_REFUND_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

// One row per voided label in order-operations.labelRefunds; `labelRefundOpen` marks rows still pending.
function refundEntry({ transactionId, refundId, trackingNumber, carrier, status, at, by }) {
  return { transactionId: transactionId || null, refundId: refundId || null, trackingNumber: trackingNumber || null,
    carrier: carrier || null, state: refundStateOf(status) || "pending", shippoStatus: String(status || "").toUpperCase() || null,
    requestedAt: at, requestedBy: by || "admin", checkedAt: at };
}
const openRefunds = (entries = []) => (Array.isArray(entries) ? entries : []).filter(e => e && e.state === "pending" && (e.refundId || e.transactionId));

// Applies the statuses Shippo returned ({ [refundId || transactionId]: status }) to the rows.
function applyRefundChecks(entries = [], results = {}, at) {
  let changed = false;
  const next = (Array.isArray(entries) ? entries : []).map(entry => {
    if (!entry || entry.state !== "pending") return entry;
    const status = results[entry.refundId || entry.transactionId];
    if (!status) return entry;
    const state = refundStateOf(status);
    if (!state || (state === entry.state && String(status).toUpperCase() === entry.shippoStatus)) return { ...entry, checkedAt: at };
    changed = true;
    return { ...entry, state, shippoStatus: String(status).toUpperCase(), checkedAt: at, ...(state !== "pending" ? { settledAt: at } : {}) };
  });
  return { entries: next, changed, open: openRefunds(next).length > 0 };
}

module.exports = { labelHandedOver, refundStateOf, transactionRefundState, findLabelTransaction, refundEntry, openRefunds,
  applyRefundChecks, REFUND_WINDOW_DAYS, STALE_REFUND_DAYS, DAY };
