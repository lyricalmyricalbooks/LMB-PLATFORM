// The order review queue (code plan 12.9). A paid order whose card payment looks risky waits for the owner before it is
// packed or labelled. The card company's own signals decide; the shop adds no scoring of its own.
//
//   order.review      { status: "needs_review", reasons: [plain words], flaggedAt }   written here, by the server only
//   operations.reviewCleared   the time the owner pressed "It looks fine" (order-operations, written by the admin)
//
// A decision is never undone by a later read: once an order has a `review`, reading the payment again changes nothing.
// A refunded order needs no review (the money is back), which the callers' own "active paid order" checks already cover.

const BAD_CHECKS = new Set(["fail"]);

/** The plain-word reasons a payment looks risky; [] when it looks normal. `risk` is what the provider answered. */
function reviewReasons(risk, order = {}) {
  if (!risk || typeof risk !== "object") return [];
  const reasons = [];
  if (risk.level === "elevated") reasons.push("The card company rated this payment as higher risk than usual.");
  if (risk.level === "highest") reasons.push("The card company rated this payment as very high risk.");
  if (BAD_CHECKS.has(risk.cvcCheck)) reasons.push("The card's security code did not match.");
  if (BAD_CHECKS.has(risk.postalCheck)) reasons.push("The card's postal code did not match the bank's record.");
  if (!reasons.length) return [];
  const delivery = String(order.customer?.address?.country || "").toUpperCase();
  const card = String(risk.cardCountry || "").toUpperCase();
  if (delivery && card && delivery !== card) reasons.push(`The card is from ${card} and the parcel goes to ${delivery}.`);
  return reasons;
}

/** True while the owner still has to look at this order. `operations` is the order's private record. */
const reviewOpen = (order, operations = {}) => order?.review?.status === "needs_review" && !operations?.reviewCleared;

/** What stops the owner from packing or shipping; "" when nothing does. */
function reviewProblem(order, operations = {}) {
  if (!reviewOpen(order, operations)) return "";
  return "This payment looks risky. Check the order, then press \"It looks fine\" to continue, or refund it.";
}

/**
 * Flags the order when the payment looks risky. Only for the order's own saved payment, and only the first time, so an
 * owner's decision stands. Answers true when it flagged.
 */
async function recordReview(db, orderId, paymentId, risk, now = () => new Date()) {
  if (typeof orderId !== "string" || !orderId || orderId.includes("/")) return false;
  const ref = db.collection("orders").doc(orderId);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return false;
    const order = snap.data() || {};
    if (!paymentId || order.stripePaymentIntentId !== paymentId || order.review) return false;
    const reasons = reviewReasons(risk, order);
    if (!reasons.length) return false;
    const at = now().toISOString();
    t.update(ref, { review: { status: "needs_review", reasons, flaggedAt: at }, updatedAt: at });
    return true;
  });
}

module.exports = { reviewReasons, reviewOpen, reviewProblem, recordReview };
