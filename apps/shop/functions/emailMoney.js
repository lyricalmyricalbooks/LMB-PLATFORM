// Order amounts are stored in CAD. Customer emails show what the customer was charged:
// the order's own checkout currency at the rate saved when it was priced.
const SYMBOLS = { CAD: "CA$", USD: "US$", EUR: "€" };

function orderMoneyFmt(cad, order) {
  const n = Number(cad || 0);
  const currency = String((order && order.checkoutCurrency) || "CAD").toUpperCase();
  const rate = Number(order && order.exchangeRate);
  const value = currency !== "CAD" && rate > 0 ? n * rate : n;
  return `${SYMBOLS[currency] || `${currency} `}${value.toFixed(2)}`;
}

// The order total as the customer was actually charged. A card or PayPal payment was created for
// exactly expectedAmountMinor in expectedCurrency (the server rounds each line), which can differ by
// a few cents from total × rate; older and manual orders without it fall back to the conversion.
function chargedTotalFmt(order) {
  const minor = Number(order && order.expectedAmountMinor);
  const currency = String((order && order.expectedCurrency) || "").toUpperCase();
  if (order && order.expectedAmountMinor != null && Number.isFinite(minor) && currency) {
    return `${SYMBOLS[currency] || `${currency} `}${(minor / 100).toFixed(2)}`;
  }
  return orderMoneyFmt(order && order.total, order);
}

// The refund line in the customer's email: the refunded amount in the currency it went back in.
// Older records without a currency are treated as the order total in CAD.
function refundAmountText(order) {
  const refunded = Number(order && order.refund && order.refund.amount);
  if (!Number.isFinite(refunded)) return orderMoneyFmt(order && order.total, order);
  const currency = String((order.refund && order.refund.currency) || "CAD").toUpperCase();
  return `${SYMBOLS[currency] || `${currency} `}${refunded.toFixed(2)}`;
}

// The shipped email when no tracking number was entered: drop the lines about the carrier's
// tracking, and "with {{tracking_carrier}}", so the customer doesn't see blanks.
// What the "Order refunded" email should say (pure). `redemptions` = the gift cards the order was
// paid with (chargedRedemptions), CAD cents. Returns null when no email should go out: a lost
// chargeback is the bank taking the money back, not a refund from the shop.
function refundEmailFacts(order, redemptions = []) {
  if (!order || (order.refund && order.refund.provider === "dispute")) return null;
  const giftMinor = order.giftCardsRestoredAt
    ? (redemptions || []).reduce((sum, r) => sum + (Number(r && r.minor) || 0), 0) : 0;
  const providerRefund = order.refund && order.refund.provider && order.refund.provider !== "manual";
  // A manual refund records the CAD order total; the customer paid what their emails showed.
  const money = providerRefund || order.refundedAmountMinor != null ? refundAmountText(order) : chargedTotalFmt(order);
  const moneyZero = !(Number(money.replace(/[^\d.]/g, "")) > 0);
  const giftText = giftMinor > 0 ? `CA$${(giftMinor / 100).toFixed(2)}` : "";
  const cards = (redemptions || []).map(r => r && r.last4 ? `••••${r.last4}` : "").filter(Boolean).join(", ");
  return { amountText: moneyZero && giftText ? giftText : money, giftText, cards, giftOnly: moneyZero && !!giftText };
}

// Drops sentences that only apply to a card/bank refund (a gift-card-only refund is instant).
function withoutBankRefundSentences(body) {
  return String(body || "").split("\n").map(line => line.split(/(?<=[.!?])\s+/)
    .filter(sentence => !/original payment method|business days|bank/i.test(sentence)).join(" ")).join("\n");
}

// Pickup / local-delivery updates have no carrier at all: drop every line that names one.
function withoutCarrierLines(body) {
  return String(body || "")
    .split("\n")
    .filter(line => !/\{\{\s*tracking_(?:carrier|number|url)\s*\}\}|carrier'?s website/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function withoutTrackingLines(body) {
  return String(body || "")
    .split("\n")
    .filter(line => !/\{\{tracking_number\}\}|\{\{tracking_url\}\}|carrier'?s website/i.test(line))
    .join("\n")
    .replace(/\s+with \{\{tracking_carrier\}\}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// An order with nothing physical in it (e-books, audiobooks, gift cards) is never "shipped":
// drop every sentence about shipping, dispatch or tracking from the confirmation body, and say
// where the files are when there are download links to point at.
function forDigitalOnlyOrder(body, { hasDownloads = false } = {}) {
  let dropped = false;
  const text = String(body || "").split("\n").map(line => line.split(/(?<=[.!?])\s+/)
    .filter(sentence => {
      const drop = /\b(ship|shipped|shipping|shipment|dispatch|dispatched|tracking|deliver(?:y|ed)?)\b/i.test(sentence);
      dropped = dropped || drop;
      return !drop;
    }).join(" ")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return dropped && hasDownloads ? `${text}${text ? " " : ""}Your download links are below.` : text;
}

module.exports = { orderMoneyFmt, chargedTotalFmt, refundAmountText, withoutTrackingLines, withoutCarrierLines, refundEmailFacts, withoutBankRefundSentences, forDigitalOnlyOrder };
