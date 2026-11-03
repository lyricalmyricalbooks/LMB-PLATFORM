// Payment links (code plan 21.1): an order the owner makes for a customer — a phone or email order, a custom quote, a
// bulk price — at prices the owner sets, which the customer pays from a link. Like a store's "draft order" with an
// invoice link, but with no second checkout:
//
//   orders/{orderId}         an ordinary unpaid order (status pending_payment), made here with the Admin SDK. The link is
//                            the order page's own link (/track?orderId=…&key=<trackingKey>); its "Pay now" opens the
//                            shop's normal card page for this order.
//   paymentLinks/{orderId}   the agreed prices: { status, keyHash, lines: [{ id, variantId, quantity, price }],
//                            shipping (amount, or null for nothing to ship), note, expiresAt, createdAt, createdBy }.
//                            Admin-only in the rules; written only here.
//
// Every payment path prices through priceOrder (index.js), which asks paymentLinkFor() for the record. The agreed prices
// are used only while the record is open and not expired, belongs to this exact order (the hash of its access key, so a
// record left behind by a deleted order can't price another order made at the same id), and the order's lines are the
// ones agreed. No discount applies on top; tax is worked out as for any order. A paid order can't be paid again for the
// same reasons any order can't, and cancelling the order (Orders › order › Cancel) closes its link.
const crypto = require("crypto");

const MAX_LINES = 50;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;
const MAX_PRICE = 100000;
const MAX_SHIPPING = 10000;

const keyHash = key => crypto.createHash("sha256").update(String(key || "")).digest("hex");
const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const cents = value => Math.round(Number(value) * 100) / 100;
const sameLine = (a, b) => a.id === b.id && (a.variantId || null) === (b.variantId || null);
const validId = id => typeof id === "string" && !!id && id.length <= 160 && !id.includes("/");

class LinkInputError extends Error {}

/**
 * Checks what the admin sent and returns the cleaned link: { customer, lines, shipping, note, days }. Throws
 * LinkInputError with a plain sentence for the owner. Prices are optional per line (blank = the shop's price today).
 */
function cleanLinkInput(body) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const contact = source.customer && typeof source.customer === "object" ? source.customer : {};
  const name = text(contact.name, 200);
  const email = text(contact.email, 320).toLowerCase();
  if (!name) throw new LinkInputError("Add the customer's name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new LinkInputError("Check the customer's email address.");
  const address = Object.fromEntries(["street", "unit", "city", "state", "zip", "country"].map(key => [key, text(contact.address?.[key], 200)]));
  // Tax follows the customer's country and province, so both are needed even when nothing is shipped.
  if (!address.country || !address.state) throw new LinkInputError("Add the customer's country and province or state (tax depends on them).");

  const shippingGiven = source.shipping !== null && source.shipping !== undefined && source.shipping !== "";
  const shipping = shippingGiven ? cents(source.shipping) : null;
  if (shippingGiven && !(Number.isFinite(shipping) && shipping >= 0 && shipping <= MAX_SHIPPING)) throw new LinkInputError("Enter a shipping amount between 0 and 10,000, or choose nothing to ship.");
  if (shippingGiven && (!address.street || !address.city || !address.zip)) throw new LinkInputError("Add the street, city and postal code to ship this order.");

  const rawLines = Array.isArray(source.lines) ? source.lines : [];
  if (!rawLines.length || rawLines.length > MAX_LINES) throw new LinkInputError(`Add between 1 and ${MAX_LINES} products.`);
  const lines = [];
  for (const raw of rawLines) {
    if (!raw || !validId(raw.id)) throw new LinkInputError("One of the products can't be found. Remove it and add it again.");
    const variantId = raw.variantId == null || raw.variantId === "" ? null : raw.variantId;
    if (variantId !== null && !validId(variantId)) throw new LinkInputError("One of the products can't be found. Remove it and add it again.");
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new LinkInputError("Each quantity must be a whole number from 1 to 99.");
    const priceGiven = raw.price !== null && raw.price !== undefined && raw.price !== "";
    const price = priceGiven ? cents(raw.price) : null;
    if (priceGiven && !(Number.isFinite(price) && price >= 0 && price <= MAX_PRICE)) throw new LinkInputError("Each price must be between 0 and 100,000.");
    const line = { id: raw.id, variantId, quantity, price };
    if (lines.some(other => sameLine(other, line))) throw new LinkInputError("A product is listed twice. Put its copies on one line.");
    lines.push(line);
  }
  const days = source.days === undefined || source.days === null || source.days === "" ? DEFAULT_DAYS : Number(source.days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) throw new LinkInputError(`The link can stay open for 1 to ${MAX_DAYS} days.`);
  return { customer: { name, email, phone: text(contact.phone, 80), address }, lines, shipping, note: text(source.note, 500), days };
}

/** Why a link's agreed prices can't be used to pay now ("expired" | "closed"), or null. */
function linkProblem(link, now = Date.now()) {
  if (!link || link.status !== "open") return "closed";
  if (!(Date.parse(link.expiresAt) > now)) return "expired";
  return null;
}

/**
 * The payment link that prices this order, or null when the order has none. A record whose key doesn't match the
 * order's is not this order's (an order made at a deleted order's id) and is ignored, so the order is priced normally.
 */
async function paymentLinkFor(db, orderId, order) {
  if (!validId(orderId) || !order || typeof order.trackingKey !== "string") return null;
  const snap = await db.collection("paymentLinks").doc(orderId).get();
  const link = snap.exists ? snap.data() : null;
  if (!link || link.keyHash !== keyHash(order.trackingKey)) return null;
  return link;
}

/**
 * Puts the agreed prices on the priced lines. The lines must be exactly the agreed ones (same products, editions and
 * quantities); a line with no agreed price keeps the shop's price. Returns false when the lines were changed.
 */
function applyLinkPrices(items, link) {
  const agreed = (link.lines || []).map(line => ({ ...line, used: false }));
  if (items.length !== agreed.length) return false;
  for (const item of items) {
    const line = agreed.find(other => !other.used && sameLine(other, item) && Number(other.quantity) === Number(item.quantity));
    if (!line) return false;
    line.used = true;
    if (line.price !== null && line.price !== undefined) {
      item.price = cents(line.price);
      // The add-on breakdown no longer adds up to an agreed price; the price is the whole line.
      delete item.basePrice;
      delete item.addOns;
    }
  }
  return true;
}

/** Plain words for the customer when a link can't be paid. */
const LINK_MESSAGES = {
  expired: "This payment link has expired. Please ask the shop for a new one.",
  closed: "This payment link is no longer open. Please ask the shop for a new one.",
  changed: "This order was changed after its payment link was made. Please ask the shop for a new link.",
};

/**
 * The admin action that makes a payment link (createStripeCheckoutSession `action: "paymentLink"`). index.js passes in
 * its guards and pricing; `priceOrder` takes the draft record so the order is priced exactly as it will be paid.
 */
function paymentLinkActions({ db, requireAdmin, priceOrder, PricingError, publicErrorMessage, now = () => new Date() }) {
  async function handlePaymentLink(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    if (req.body?.op !== "create") return res.status(400).json({ error: "Unknown payment link action." });
    let input;
    try {
      input = cleanLinkInput(req.body.link);
    } catch (err) {
      if (err instanceof LinkInputError) return res.status(400).json({ error: err.message });
      throw err;
    }
    try {
      const at = now();
      const createdAt = at.toISOString();
      const orderId = crypto.randomBytes(12).toString("hex").toUpperCase();
      const trackingKey = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(at.getTime() + input.days * 86400000).toISOString();
      const order = {
        customer: { ...input.customer, billingAddress: input.customer.address },
        items: input.lines.map(line => ({ id: line.id, variantId: line.variantId, quantity: line.quantity })),
        trackingKey,
      };
      const draft = { status: "open", keyHash: keyHash(trackingKey), lines: input.lines, shipping: input.shipping, note: input.note, expiresAt };
      let priced;
      try {
        priced = await priceOrder(order, { orderId, paymentLink: draft });
      } catch (err) {
        if (err instanceof PricingError) return res.status(400).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
        throw err;
      }
      // A card can't take less than about 50 cents; a free order is better recorded by hand.
      if (!(priced.total >= 0.5)) return res.status(400).json({ error: "The total is under $0.50, which a card can't take. Raise a price or record the order another way." });
      // The prices are frozen now: a line left blank keeps today's shop price even if the catalog changes later.
      const link = {
        ...draft,
        lines: input.lines.map(line => ({ ...line, price: cents(priced.items.find(item => sameLine(item, line)).price) })),
        createdAt,
        createdBy: adminUser.email || "admin",
      };
      const actor = adminUser.email || "the owner";
      await db.collection("paymentLinks").doc(orderId).set(link);
      await db.collection("orders").doc(orderId).create({
        ...order,
        items: priced.items.map(({ shippingProfileId, ...item }) => item),
        subtotal: priced.subtotal, discount: 0, appliedDiscount: null, shipping: priced.shipping,
        ...(priced.shippingMethod ? { shippingMethod: priced.shippingMethod } : {}),
        fulfillment: priced.fulfillment, tax: priced.tax, taxLines: priced.taxLines, total: priced.total,
        giftCardAmount: 0, giftCardRedemptions: [],
        // "Stripe" is what every card order carries (a Square shop's too): refunds, the admin and stock follow it.
        orderId, status: "pending_payment", paymentStatus: "unpaid", paymentMethod: "Stripe", source: "payment_link",
        paymentLink: { expiresAt, ...(input.note ? { note: input.note } : {}) },
        referralSource: "payment_link",
        createdAt, updatedAt: createdAt,
        activity: [{ type: "event", message: `Payment link made by ${actor}, open until ${expiresAt.slice(0, 10)}.`, createdAt }],
      });
      return res.status(200).json({ orderId, trackingKey, total: priced.total, expiresAt });
    } catch (err) {
      console.error("Payment link failed:", err);
      return res.status(500).json({ error: publicErrorMessage(err, "We couldn't make this payment link. Please try again.") });
    }
  }
  return { handlePaymentLink };
}

// A reminder (code plan 21.5): one email to the customer when an unpaid link has two days or less left, from the
// 15-minute unpaidPaymentSweep. Settings › Notifications › Payment link reminder writes it and can switch it off. A link
// made less than a day ago is never reminded, so a short link doesn't get a reminder straight after its own email.
const REMIND_BEFORE_MS = 2 * 86400000;
const REMIND_MIN_AGE_MS = 86400000;

/** Is this order's link due its reminder? (Pure; the link record is checked again before sending.) */
function reminderDue(order, now = Date.now()) {
  if (!order || order.source !== "payment_link" || order.paymentStatus !== "unpaid" || order.status !== "pending_payment") return false;
  if (!cleanEmail(order.customer?.email)) return false;
  const left = Date.parse(order.paymentLink?.expiresAt || "") - now;
  const age = now - Date.parse(order.createdAt || "");
  return left > 0 && left <= REMIND_BEFORE_MS && age >= REMIND_MIN_AGE_MS;
}

const cleanEmail = value => {
  const email = String(value || "").trim();
  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/.test(email) ? email : "";
};

/** The day a link closes, as the customer reads it ("November 5, 2026"), in the shop's time zone. */
const closingDay = iso => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "long", day: "numeric" }).format(new Date(iso));

/**
 * Sends the reminders due among `orders` (the sweep's unpaid payment-link orders). Each one is sent once: the link record
 * is stamped `reminderSentAt` (never the order, so the order triggers don't wake), and sendOrderEmailOnce's claim stops a
 * second copy if two sweeps overlap. Returns how many went.
 */
async function sendLinkReminders({ db, orders, settings, compileEmailTemplate, orderTrackUrl, sendOrderEmailOnce, moneyFmt, secret, now = Date.now() }) {
  if (settings?.payment_link_reminder?.enabled === false) return { sent: 0 };
  let sent = 0;
  for (const order of orders || []) {
    if (!reminderDue(order, now)) continue;
    const orderId = order.id;
    try {
      const ref = db.collection("paymentLinks").doc(orderId);
      const snap = await ref.get();
      const link = snap.exists ? snap.data() : null;
      // Only this order's own open link, and only once.
      if (!link || link.keyHash !== keyHash(order.trackingKey) || linkProblem(link, now) || link.reminderSentAt) continue;
      const compiled = compileEmailTemplate("payment_link_reminder", settings, {
        customer_name: order.customer?.name || "there",
        order_id: order.orderId || orderId,
        total_price: moneyFmt(order.total),
        expires_on: closingDay(link.expiresAt),
        button_url: await orderTrackUrl(orderId, order),
      });
      await sendOrderEmailOnce(orderId, "payment_link_reminder", { to: cleanEmail(order.customer.email), subject: compiled.subject, html: compiled.html, secret });
      await ref.set({ reminderSentAt: new Date(now).toISOString() }, { merge: true });
      sent += 1;
    } catch (err) {
      // A queued email (every sender refused) is retried by the email queue; its claim stops a second copy.
      if (err?.queued) await db.collection("paymentLinks").doc(orderId).set({ reminderSentAt: new Date(now).toISOString() }, { merge: true }).catch(() => {});
      else console.warn(`Payment link reminder for ${orderId} failed:`, err.message);
    }
  }
  return { sent };
}

module.exports = { reminderDue, sendLinkReminders, REMIND_BEFORE_MS, cleanLinkInput, linkProblem, paymentLinkFor, applyLinkPrices, paymentLinkActions, keyHash, LinkInputError, LINK_MESSAGES, DEFAULT_DAYS, MAX_DAYS };
