// Who is using a discount code right now. A code's usageCount only goes up when an order is PAID,
// so shoppers checking out at the same moment (or placing e-Transfer orders that wait for payment)
// would all be priced at the discount. These pure helpers let priceOrder count the orders that have
// already claimed a use but are not paid yet, and match a customer by their real mailbox rather than
// the exact text typed (name+2@gmail.com and n.ame@gmail.com are the same person as name@gmail.com).

const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/** The mailbox behind an address: lower-case, `+tag` removed, dots ignored and googlemail = gmail for Gmail. */
function emailIdentity(email) {
  const text = String(email || "").trim().toLowerCase();
  const at = text.lastIndexOf("@");
  if (at < 1) return text;
  let local = text.slice(0, at);
  let domain = text.slice(at + 1);
  local = local.split("+")[0];
  if (GMAIL.has(domain)) { local = local.replace(/\./g, ""); domain = "gmail.com"; }
  return `${local}@${domain}`;
}

const CARD_WINDOW_MS = 35 * 60 * 1000; // stock holds last 30 minutes; a payment started inside it is still live

/**
 * Orders (other than `orderId`) that hold a use of the code without having paid: manual-payment
 * orders waiting for their money, and card/PayPal orders whose payment was started in the last
 * 35 minutes. Cancelled, refunded and test orders hold nothing.
 */
function openClaims(orders, { orderId = "", now = Date.now() } = {}) {
  return (orders || []).filter(order => {
    if (!order || order.id === orderId || order.isTest === true) return false;
    if (order.status === "cancelled" || order.status === "refunded") return false;
    if (order.paymentStatus === "pending") return true;
    if (order.paymentStatus !== "unpaid") return false;
    const started = order.stripePaymentIntentId || order.stripeCheckoutSessionId || order.paypalOrderId;
    if (!started) return false;
    const touched = Date.parse(order.updatedAt || order.createdAt || "");
    return Number.isFinite(touched) && now - touched <= CARD_WINDOW_MS;
  });
}

/** True when paid uses plus other shoppers' open claims already fill the code's usage limit. */
function limitReached(discount, claims, identity) {
  const limit = Number(discount && discount.usageLimit) || 0;
  if (!(limit > 0)) return false;
  // The same shopper's earlier attempts are their own retries, not extra uses.
  const others = new Set((claims || []).map(order => emailIdentity(order.customer && order.customer.email)).filter(id => id && id !== identity));
  return (Number(discount.usageCount) || 0) + others.size >= limit;
}

module.exports = { emailIdentity, openClaims, limitReached };
