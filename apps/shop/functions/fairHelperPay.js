// Card payments by QR code at a fair helper's till (docs/combined-admin.md › Fair helpers plan, H5). A helper can't
// hold the shop's payment keys, so the server makes the payment page: the helper's phone sends the sale's books and
// counts, this file prices them from the till's menu (fairTill/menu, written by the owner's stockroom), never from the
// helper's screen, and index.js fairHelperPayment opens a 30-minute card checkout on the shop's own payment account.
// The customer scans its QR code; the helper's till asks "is it paid?" and records the sale once it is. The payment
// names the sale (metadata fair_sale) and the helper, and no shop order is made, so nothing reaches the website's
// orders or stock: the sale reaches the books the usual way, through the helper's inbox. Pure.

const MAX_LINES = 50;
const MAX_QTY = 99;
const SALE_ID = /^[A-Za-z0-9_-]{8,64}$/;
// Stripe's smallest charge in most currencies (0.50).
const MIN_MINOR = 50;
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "XAF", "XOF", "PYG", "UGX", "RWF"]);

/**
 * What the helper's sale costs, from the menu: { amountMinor, currency, count, name } or { problem } (a plain sentence
 * for the helper). Every book must be on the menu, in one currency, in whole counts.
 */
function fairPayPlan(menu, { saleId, lines } = {}) {
  if (!SALE_ID.test(String(saleId || ""))) return { problem: "This sale can't be paid by QR. Start it again." };
  const list = Array.isArray(lines) ? lines : [];
  if (!list.length || list.length > MAX_LINES) return { problem: "Add the books to the sale first." };
  const books = new Map((Array.isArray(menu?.books) ? menu.books : []).map(b => [String(b?.id || ""), b]));
  let total = 0;
  let count = 0;
  let currency = "";
  for (const line of list) {
    const book = books.get(String(line?.bookId || ""));
    const qty = Number(line?.qty);
    if (!book) return { problem: "A book in this sale isn't on the till any more. Remove it and try again." };
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { problem: "Check how many of each book are in the sale." };
    const cur = String(book.cur || "CAD").toUpperCase();
    if (currency && cur !== currency) return { problem: "Books in two currencies can't be paid together. Ring them up as two sales." };
    currency = cur;
    const price = Number(book.price);
    if (!Number.isFinite(price) || price < 0) return { problem: "A book in this sale has no price." };
    total += price * qty;
    count += qty;
  }
  const amountMinor = ZERO_DECIMAL.has(currency) ? Math.round(total) : Math.round(total * 100);
  if (amountMinor < MIN_MINOR && !ZERO_DECIMAL.has(currency)) return { problem: "Card payments need a sale of at least 0.50." };
  return { amountMinor, currency, count, name: `Book fair sale (${count} ${count === 1 ? "item" : "items"})` };
}

/** The card checkout to open for a planned sale (Stripe Checkout Session parameters). */
function fairCheckoutParams(plan, { saleId, helper, shopName, returnUrl, nowSeconds }) {
  const metadata = { fair_sale: saleId, fair_helper: helper };
  const description = `${shopName ? `${shopName}: ` : ""}${plan.name}`.slice(0, 350);
  return {
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: plan.currency.toLowerCase(), unit_amount: plan.amountMinor, product_data: { name: description.slice(0, 250) } } }],
    metadata,
    payment_intent_data: { description, metadata },
    // Stripe's shortest life for a checkout: the code stops working half an hour after it is made.
    expires_at: nowSeconds + 30 * 60,
    success_url: returnUrl,
  };
}

/** The helper's own payment, from a checkout the payment account returned: { paid, open } or null when not theirs. */
function fairPaymentState(session, helper) {
  if (!session || session.metadata?.fair_helper !== helper || !session.metadata?.fair_sale) return null;
  return { paid: session.payment_status === "paid", open: session.status === "open" };
}

module.exports = { fairPayPlan, fairCheckoutParams, fairPaymentState, SALE_ID };
