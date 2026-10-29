// Finds orders whose Stripe payment may have succeeded while the webhook never marked them paid.
// Pure helpers; the scheduled function in index.js does the Stripe lookups and the email.
const { isPaymentId, isCheckoutId } = require("./payments/ids");

const MIN_AGE_MS = 10 * 60 * 1000;          // give the webhook 10 minutes first
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // older ones are stale

function suspectOrders(orders, nowMs = Date.now()) {
  return (orders || []).filter((o) => {
    if (!o || o.paymentStatus === "paid" || o.paymentAlertSentAt) return false;
    // Mismatched or stock-conflicted orders were already reached by the webhook; they need a
    // refund decision, not a "webhook missed" alert. Cancelled orders stay in: a card that went
    // through after cancelling with no webhook must still be found.
    if (o.paymentMismatch || o.inventoryConflict) return false;
    const hasIntent = isPaymentId(o.stripePaymentIntentId);
    const hasSession = isCheckoutId(o.stripeCheckoutSessionId);
    if (!hasIntent && !hasSession) return false;
    const age = nowMs - Date.parse(o.createdAt || "");
    return age >= MIN_AGE_MS && age <= MAX_AGE_MS;
  });
}

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// `card`: the shop's card payment company as the press sees it (payments/index.js providerName; code plan 5.2).
function alertHtml(found, card = "Stripe") { // Stripe shops only (the default)
  const name = escapeHtml(card);
  const rows = found.map((f) => `<li><strong>${escapeHtml(f.orderId)}</strong> — ${escapeHtml(f.email || "no email")} — ${escapeHtml((f.amount / 100).toFixed(2))} ${escapeHtml(String(f.currency || "").toUpperCase())} (${name} ${escapeHtml(f.intentId)})${f.fixed === false ? ` — <strong>waiting for the payment to be confirmed; check again in ${name}</strong>` : " — now marked paid"}</li>`).join("");
  return `<p>${name} shows these payments as <strong>succeeded</strong>, but the shop was never told. These orders stay unpaid until the payment is confirmed. Do not ship them yet.</p><ul>${rows}</ul><p>Open Admin › Settings › Payments for the next step.</p>`;
}

module.exports = { suspectOrders, alertHtml, MIN_AGE_MS, MAX_AGE_MS };
