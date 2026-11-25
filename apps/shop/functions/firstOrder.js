// The shop's first real order (sign-up to open shop plan, move 5): the paid-order email to the owner becomes a small
// celebration with what to do next. "Real" is the same rule the Overview's sales use: paid, not a test or practice
// order, not a past order brought over from another shop. Reads at most a handful of paid orders, never the whole list.

const LOOK = 6;

/** A paid order that counts as a real sale. */
function isRealSale(order) {
  return !!order && order.paymentStatus === "paid" && order.isTest !== true && !order.sandboxPayment && order.source !== "import";
}

/**
 * Whether `orderId` (just paid) is the shop's first real sale. `db` is the shop's scoped database. When the answer
 * can't be told from the few paid orders read (all of them tests, say), it says no: the email stays the plain one.
 */
async function isFirstRealSale(db, orderId, order) {
  if (!isRealSale(order)) return false;
  const snap = await db.collection("orders").where("paymentStatus", "==", "paid").limit(LOOK).get();
  const others = snap.docs.filter((d) => d.id !== orderId);
  if (others.some((d) => isRealSale(d.data()))) return false;
  return snap.size < LOOK;
}

/** The owner's email words for the first sale: a subject and a short "what to do next" block (HTML, escaped values). */
function firstSaleWords({ orderRef, total, customer, escapeHtml }) {
  return {
    // Keeps the "[NEW ORDER]" tag every paid-order email carries, so an owner's mail filters still catch it.
    subject: `[NEW ORDER] Your first order! ${orderRef} · paid · ${total} · ${customer}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto 8px;padding:20px 24px;border-radius:16px;background:#a9e8c6;color:#1f1e1b;">
      <p style="margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;">Your first order</p>
      <p style="margin:0 0 10px;font-size:22px;font-weight:700;">${escapeHtml(customer)} just bought from you.</p>
      <p style="margin:0;">What to do next: pack it, buy a label from the order, and mark it shipped. Your customer gets an email at each step. Then share your shop again: first orders bring the next ones.</p>
    </div>`,
  };
}

module.exports = { isRealSale, isFirstRealSale, firstSaleWords };
