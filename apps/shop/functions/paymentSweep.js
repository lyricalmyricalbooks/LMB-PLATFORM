// Finds orders whose Stripe payment may have succeeded while the webhook never marked them paid.
// Pure helpers; the scheduled function in index.js does the Stripe lookups and the email.
const MIN_AGE_MS = 10 * 60 * 1000;          // give the webhook 10 minutes first
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // older ones are stale

function suspectOrders(orders, nowMs = Date.now()) {
  return (orders || []).filter((o) => {
    if (!o || o.paymentStatus === "paid" || o.paymentAlertSentAt) return false;
    // Mismatched or stock-conflicted orders were already reached by the webhook; they need a
    // refund decision, not a "webhook missed" alert. Cancelled orders stay in: a card that went
    // through after cancelling with no webhook must still be found.
    if (o.paymentMismatch || o.inventoryConflict) return false;
    const hasIntent = typeof o.stripePaymentIntentId === "string" && o.stripePaymentIntentId.startsWith("pi_");
    const hasSession = typeof o.stripeCheckoutSessionId === "string" && o.stripeCheckoutSessionId.startsWith("cs_");
    if (!hasIntent && !hasSession) return false;
    const age = nowMs - Date.parse(o.createdAt || "");
    return age >= MIN_AGE_MS && age <= MAX_AGE_MS;
  });
}

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function alertHtml(found) {
  const rows = found.map((f) => `<li><strong>${escapeHtml(f.orderId)}</strong> — ${escapeHtml(f.email || "no email")} — ${escapeHtml((f.amount / 100).toFixed(2))} ${escapeHtml(String(f.currency || "").toUpperCase())} (Stripe ${escapeHtml(f.intentId)})${f.fixed === false ? " — <strong>awaiting the verified webhook; review Webhook health and resend the payment event in Stripe</strong>" : " — now marked paid"}</li>`).join("");
  return `<p>Stripe shows these payments as <strong>succeeded</strong>, but the Stripe webhook never told the shop. These orders remain unpaid until a verified webhook confirms them. Do not ship them yet.</p><ul>${rows}</ul><p>To stop this happening, open Admin › Settings › Payments › <strong>Webhook health</strong> and press <strong>Check &amp; fix webhook</strong>.</p>`;
}

module.exports = { suspectOrders, alertHtml, MIN_AGE_MS, MAX_AGE_MS };
