// Partial refunds from Order detail › More order actions › Refund (pure, tested in
// partialRefund.test.js). The server decides whether a requested amount is a partial
// refund (order stays paid, `partiallyRefunded` + `refundedAmountMinor`, the same state a
// Stripe Dashboard partial refund leaves) or reaches what is left (today's full refund).
// Nothing is restocked unless the owner ticks specific lines; never more than was charged.
const { isPhysicalItem } = require("./shared/localFulfillment");

const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };

/** What the customer's card / PayPal / manual payment was for, in minor units of its currency. */
function chargedOf(order) {
  const expected = Number(order?.expectedAmountMinor);
  if (Number.isInteger(expected) && expected > 0) {
    return { minor: expected, currency: String(order.expectedCurrency || order.checkoutCurrency || "CAD").toUpperCase() };
  }
  return { minor: Math.max(0, Math.round((Number(order?.total) || 0) * 100)), currency: String(order?.checkoutCurrency || "CAD").toUpperCase() };
}

/** Already refunded (admin partial refunds plus anything Stripe/PayPal reported). */
const refundedSoFar = order => Math.max(0, Math.floor(Number(order?.refundedAmountMinor) || 0));

/** What may still be refunded on this order, in minor units. */
const refundableOf = order => Math.max(0, chargedOf(order).minor - refundedSoFar(order));

/**
 * Turn the admin's request into a plan. `amountMinor` missing → today's full refund.
 * A partial amount must be a whole number of cents above zero and below what is left;
 * an amount equal to what is left is a full refund. More than is left is refused.
 */
function refundPlan(order, amountMinor) {
  const charged = chargedOf(order);
  const already = refundedSoFar(order);
  const remaining = Math.max(0, charged.minor - already);
  if (amountMinor == null || amountMinor === "") return { kind: "full", amountMinor: remaining, already, remaining, currency: charged.currency };
  const amount = Number(amountMinor);
  if (!Number.isInteger(amount) || amount <= 0) fail("Enter a refund amount above zero.");
  if (amount > remaining) fail(`You can refund at most ${(remaining / 100).toFixed(2)} ${charged.currency} on this order (${(already / 100).toFixed(2)} already refunded).`, 409);
  return { kind: amount === remaining ? "full" : "partial", amountMinor: amount, already, remaining, currency: charged.currency };
}

/** Copies already put back on the shelf by earlier partial refunds, per order line. */
function restockedByLine(order) {
  const out = new Map();
  for (const row of Array.isArray(order?.partialRestockedItems) ? order.partialRestockedItems : []) {
    if (!row || !Number.isInteger(row.index)) continue;
    out.set(row.index, (out.get(row.index) || 0) + Math.max(0, Math.floor(Number(row.quantity) || 0)));
  }
  return out;
}

/**
 * The lines the owner ticked to restock with a partial refund: `[{ index, quantity }]`.
 * Only printed (physical, non-gift-card) lines, whole copies, and never more copies than
 * the line had minus copies an earlier partial refund already restocked.
 */
function restockLinesFor(order, lines) {
  if (lines == null) return [];
  if (!Array.isArray(lines) || lines.length > 100) fail("Choose which books go back to stock.");
  const items = Array.isArray(order?.items) ? order.items : [];
  const done = restockedByLine(order);
  const seen = new Set();
  const out = [];
  for (const row of lines) {
    const index = Number(row?.index), quantity = Number(row?.quantity);
    if (!Number.isInteger(index) || seen.has(index) || !items[index]) fail("A book to restock is not on this order. Reload the order.");
    seen.add(index);
    if (!Number.isInteger(quantity) || quantity < 0) fail("Enter whole copies to restock.");
    if (!quantity) continue;
    const item = items[index];
    if (item.giftCard === true || !isPhysicalItem(item)) fail(`"${item.title || item.id}" is not a printed book, so it can't go back to stock.`);
    const left = Math.max(0, Math.floor(Number(item.quantity) || 0) - (done.get(index) || 0));
    if (quantity > left) fail(`Only ${left} cop${left === 1 ? "y" : "ies"} of "${item.title || item.id}" can still go back to stock.`);
    out.push({ index, id: item.id, variantId: item.variantId || null, quantity,
      ...(Array.isArray(item.components) && item.components.length ? { components: item.components } : {}) });
  }
  return out;
}

/**
 * A later full refund restocks the order's lines; take off copies a partial refund already
 * put back so no copy is counted twice. Lines matched by book + edition.
 */
function withoutRestocked(itemList, order) {
  const already = Array.isArray(order?.partialRestockedItems) ? order.partialRestockedItems : [];
  if (!already.length) return itemList;
  const left = new Map();
  for (const row of already) {
    const key = `${row.id}|${row.variantId || ""}`;
    left.set(key, (left.get(key) || 0) + Math.max(0, Math.floor(Number(row.quantity) || 0)));
  }
  return (itemList || []).map(item => {
    const key = `${item.id}|${item.variantId || ""}`;
    const take = Math.min(left.get(key) || 0, Math.max(0, Math.floor(Number(item.quantity) || 0)));
    if (!take) return item;
    left.set(key, (left.get(key) || 0) - take);
    return { ...item, quantity: Math.floor(Number(item.quantity) || 0) - take };
  }).filter(item => Math.floor(Number(item.quantity) || 0) > 0);
}

/** Idempotency key: a double click sends the same refund; a later, deliberate one is new. */
const partialRefundKey = (orderId, already, amountMinor) => `order-refund-${orderId}-partial-${already}-${amountMinor}`;

// A refund the bank rejected (order back to paid, refund.status "failed") must not be replayed by the
// provider's idempotency cache when the owner presses Refund again: the retry gets its own key.
const refundRetrySuffix = order => {
  if (order?.refund?.status !== "failed") return "";
  const tag = String(order.refund.id || order.refundFailedAt || order.refund.failedAt || "retry").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  return `-after-${tag || "retry"}`;
};

module.exports = { refundRetrySuffix, chargedOf, refundedSoFar, refundableOf, refundPlan, restockLinesFor, withoutRestocked, partialRefundKey };
