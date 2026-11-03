// Bring past orders over from the old shop (plan 23.7; Julian said yes on 3 November 2026: "as history only"). Admin ›
// Orders › Bring past orders over reads the old shop's order file in the browser and sends each order here; only this
// server writes them, so every one has the same safe shape.
//
// History only: a past order is already paid and delivered, and moves no stock, sends no email and takes no payment.
//   - `source: "import"` makes the order hooks leave it alone (index.js handleOrderUpdated, inventoryLink.js pushKind)
//     and closes it to return requests (shared/returnRequests.js).
//   - paymentStatus "paid" (or "refunded"), fulfillmentStatus "delivered": counted in sales reports and the customer's
//     history, never in the packing queue or the daily digest. A new paid order sends nothing (onOrderCreated waits
//     for "pending").
//   - No shippedAt, stripePaymentIntentId or cartId, and reviewRequestedAt set: no sweep picks it up.
// Safe to re-run: the document id comes from the old order's own reference, and it is created in a transaction that
// refuses one already there. One audit-log line per run.
"use strict";

const crypto = require("crypto");

const MAX_ORDERS = 500;
const MAX_LINES = 100;
const MAX_TOTAL = 1000000; // dollars; far above any real order, it only stops a wrong column becoming millions
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The past order's id here, from its old reference: "PAST-" and 16 letters and digits. */
const pastOrderId = (oldRef) => `PAST-${crypto.createHash("sha256").update(`order-import:${String(oldRef).trim()}`).digest("hex").slice(0, 16).toUpperCase()}`;

const money = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 100) / 100 : NaN);
const text = (v, max) => String(v ?? "").trim().slice(0, max);

/** The order as it is saved, or the reason it can't come over. */
function pastOrder(o, { now, actor }) {
  const oldRef = text(o?.oldRef, 200);
  if (!oldRef) return { problem: "nothing to tell it apart" };
  const day = text(o.orderedAt, 40);
  const at = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T12:00:00Z` : day);
  if (!Number.isFinite(at)) return { problem: "its date couldn't be read" };
  if (at > now.getTime() + 24 * 60 * 60 * 1000) return { problem: "its date is in the future" };
  const total = money(o.total);
  if (!(total >= 0) || total > MAX_TOTAL) return { problem: "its total couldn't be read" };
  const currency = text(o.currency, 3).toUpperCase();
  if (currency && currency !== "CAD") return { problem: `in ${currency}, and this shop sells in Canadian dollars` };
  // Sold in another currency (plan 23.11): the browser converted every amount at the owner's rate; what the old shop
  // charged is kept beside it for the record.
  let paidIn = null;
  if (o.paidIn != null) {
    const code = text(o.paidIn?.currency, 3).toUpperCase();
    const charged = money(o.paidIn?.total);
    const rate = Number(o.paidIn?.rate);
    if (!/^[A-Z]{3}$/.test(code) || code === "CAD" || !(charged >= 0) || charged > MAX_TOTAL || !(rate > 0 && rate <= 10000)) {
      return { problem: "its other currency couldn't be read" };
    }
    paidIn = { currency: code, total: charged, rate };
  }
  const lines = (Array.isArray(o.items) ? o.items : []).slice(0, MAX_LINES).map((item, i) => ({
    id: `past-${i + 1}`, title: text(item?.title, 200) || "Item from your old shop",
    quantity: Math.min(9999, Math.max(1, Math.round(Number(item?.quantity) || 1))), price: Math.max(0, money(item?.price) || 0),
    ...(text(item?.sku, 80) ? { sku: text(item.sku, 80) } : {}),
  }));
  if (!lines.length) lines.push({ id: "past-1", title: "Items from your old shop", quantity: 1, price: total });
  const email = text(o.email, 320).toLowerCase();
  const refunded = Math.min(total, Math.max(0, money(o.refunded) || 0));
  const fullyRefunded = total > 0 && refunded >= total;
  const when = new Date(at).toISOString();
  const stamp = now.toISOString();
  const part = (v) => { const n = money(v); return n >= 0 ? n : 0; };
  return {
    id: pastOrderId(oldRef),
    data: {
      orderId: pastOrderId(oldRef), source: "import", importedFrom: oldRef, ...(text(o.number, 40) ? { oldOrderNumber: text(o.number, 40) } : {}),
      createdAt: when, paidAt: when, updatedAt: stamp,
      status: fullyRefunded ? "refunded" : "delivered", paymentStatus: fullyRefunded ? "refunded" : "paid", fulfillmentStatus: "delivered",
      paymentMethod: "Old shop", isTest: false,
      customer: { name: text(o.name, 100), email: EMAIL.test(email) ? email : "" },
      items: lines, subtotal: part(o.subtotal ?? total), discount: part(o.discount), shipping: part(o.shipping), tax: part(o.tax), total,
      ...(refunded > 0 ? { refundedAmountMinor: Math.round(refunded * 100) } : {}),
      ...(paidIn ? { paidIn } : {}),
      // No sweep may ask a past order's customer for a review.
      reviewRequestedAt: stamp,
      activity: [{ type: "imported", at: stamp, by: actor, note: "Brought over from your old shop" }],
    },
  };
}

/**
 * Creates the past orders. Answers { added: [id], skipped: [{ oldRef, reason }] }. `now` is injectable for tests.
 */
async function importPastOrders(db, orders, { actor = "admin", now = new Date() } = {}) {
  const added = [];
  const skipped = [];
  let total = 0;
  for (const o of (Array.isArray(orders) ? orders : []).slice(0, MAX_ORDERS)) {
    const made = pastOrder(o, { now, actor });
    if (made.problem) { skipped.push({ oldRef: text(o?.oldRef, 200), reason: made.problem }); continue; }
    const ref = db.collection("orders").doc(made.id);
    const already = await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return true;
      tx.create(ref, made.data);
      return false;
    });
    if (already) { skipped.push({ oldRef: made.data.importedFrom, reason: "already brought over" }); continue; }
    added.push(made.id);
    total += made.data.total;
  }
  if (added.length) {
    await db.collection("audit-log").add({
      type: "orders", message: `Brought ${added.length} past order${added.length === 1 ? "" : "s"} over from the old shop (CA$${total.toFixed(2)} in sales, history only)`,
      orders: added.length, by: actor, createdAt: now.toISOString(),
    }).catch(() => {});
  }
  return { added, skipped };
}

/** { status, body } for one admin request: `{ orders: [...] }`, at most MAX_ORDERS at a time. */
async function handlePastOrdersImport(body, { db, actor, now }) {
  if (!Array.isArray(body?.orders) || !body.orders.length) return { status: 400, body: { error: "Choose your old shop's order file first." } };
  if (body.orders.length > MAX_ORDERS) return { status: 400, body: { error: `Send at most ${MAX_ORDERS} orders at a time.` } };
  const { added, skipped } = await importPastOrders(db, body.orders, { actor, now });
  return { status: 200, body: { added: added.length, skipped } };
}

module.exports = { importPastOrders, handlePastOrdersImport, pastOrderId, MAX_ORDERS };
