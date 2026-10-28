// Each paid order's real card fee and the payout it arrived in (code plan 7.10), for the bookkeeping that reads them
// (plans 7.11 to 7.15). Server-written only; the provider's own records are the source:
//
//   Stripe   the charge's balance transaction (read after payment), each refund's, and on `payout.paid` the payout's
//            balance transactions (payments/stripe.js paymentMoney / payoutMoney)
//   Square   the payment's and refunds' processing fees, and on `payout.paid` the payout's entries (payments/square.js)
//
// What an order keeps (cents in the order's currency; Stripe's balance transactions are in the account's currency,
// and are converted with the rate Stripe used):
//
//   fee           everything taken from the payment: the card provider's fee and Colophon's share, less any fee a
//                 refund gave back
//   net           what reaches the press's bank for it: the payment less its fees, less what was refunded
//   platformFee   Colophon's share of `fee` (Stripe's application fee; Square's app fee)
//   payoutId      the payout the payment arrived in; payoutDate the day it reached the bank (YYYY-MM-DD)
//   moneyParts    what the sums are made of: `charge`, and one part per refund (by the refund's id), each
//                 { fee, net, platformFee, currency, exchangeRate, payoutId?, payoutDate? }
//
// Reading a payment or a payout again finds the same parts, so it changes nothing; a part seen first in a payout and
// then again after payment (or the other way round) is one part, keeping its payout.

const PART_KEY = /^(charge|[A-Za-z0-9_-]{1,100})$/;
const FIELDS = ["fee", "net", "platformFee", "currency", "exchangeRate", "payoutId", "payoutDate"];

const int = (value) => (Number.isInteger(value) ? value : 0);

/** One part as stored: only its known fields, amounts as whole cents, the currency lower case. */
function cleanPart(part) {
  const out = {};
  for (const key of FIELDS) if (part?.[key] !== undefined && part[key] !== null) out[key] = part[key];
  out.fee = int(out.fee);
  out.net = int(out.net);
  out.platformFee = int(out.platformFee);
  out.currency = String(out.currency || "").toLowerCase();
  if (!(Number(out.exchangeRate) > 0)) delete out.exchangeRate;
  return out;
}

/** The order's currency, as its payment recorded it. */
const orderCurrency = (order) => String(order.stripeCurrency || order.checkoutCurrency || order.currency || "").toLowerCase();

/**
 * An amount from a part in the order's currency. A part in another currency (a US-dollar sale paid out in Canadian
 * dollars) is converted back with the provider's own rate; null when it can't be.
 */
function inOrderCurrency(amount, part, currency) {
  if (!currency || !part.currency || part.currency === currency) return amount;
  if (!(part.exchangeRate > 0)) return null;
  return Math.round(amount / part.exchangeRate);
}

const stable = (value) => JSON.stringify(value, (_key, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));

/**
 * The order's new money fields with `parts` ({ charge?, <refund id>? }) added, or null when nothing changes.
 * A part read again keeps the payout an earlier read gave it.
 */
function moneyUpdate(order, parts) {
  const before = order.moneyParts && typeof order.moneyParts === "object" ? order.moneyParts : {};
  const after = { ...before };
  for (const [key, part] of Object.entries(parts || {})) {
    if (!PART_KEY.test(key) || !part) continue;
    // What this read knows replaces what an earlier one said; what it doesn't know (a payout, Colophon's share) stays.
    const known = Object.fromEntries(Object.entries(part).filter(([field, value]) => FIELDS.includes(field) && value !== undefined && value !== null));
    after[key] = cleanPart({ ...before[key], ...known });
  }
  if (!after.charge) return null; // nothing to add up until the payment itself is known
  const currency = orderCurrency(order) || after.charge.currency;
  let fee = 0;
  let net = 0;
  let platformFee = 0;
  for (const part of Object.values(after)) {
    const amounts = [part.fee, part.net, part.platformFee].map((amount) => inOrderCurrency(amount, part, currency));
    if (amounts.includes(null)) return null;
    fee += amounts[0];
    net += amounts[1];
    platformFee += amounts[2];
  }
  const fields = {
    moneyParts: after,
    fee,
    net,
    platformFee,
    ...(after.charge.payoutId ? { payoutId: after.charge.payoutId, payoutDate: after.charge.payoutDate ?? null } : {}),
  };
  const same = Object.entries(fields).every(([key, value]) => stable(order[key]) === stable(value));
  return same ? null : fields;
}

/**
 * Writes `parts` onto one order, in a transaction; only when something changes. Answers true when it wrote.
 * `paymentId` must be the order's own saved payment (`stripePaymentIntentId`), so a payout line never lands on the
 * wrong order.
 */
async function recordMoney(db, orderId, paymentId, parts, now = () => new Date()) {
  if (typeof orderId !== "string" || !orderId || orderId.includes("/")) return false;
  const ref = db.collection("orders").doc(orderId);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return false;
    const order = snap.data() || {};
    if (!paymentId || order.stripePaymentIntentId !== paymentId) return false;
    const fields = moneyUpdate(order, parts);
    if (!fields) return false;
    t.update(ref, { ...fields, updatedAt: now().toISOString() });
    return true;
  });
}

/**
 * After a payment or a refund: the order's charge and refunds as the provider has them now. Best effort for the
 * caller (a provider that hasn't settled the fee yet answers nothing; the payout fills it in later).
 */
async function recordOrderMoney({ db, payments, orderId, keys = null, now }) {
  const snap = await db.collection("orders").doc(orderId).get();
  if (!snap.exists) return false;
  const order = snap.data() || {};
  if (!order.stripePaymentIntentId || typeof payments.paymentMoney !== "function") return false;
  const found = await payments.paymentMoney(orderId, order, { keys });
  if (!found?.parts) return false;
  return recordMoney(db, orderId, order.stripePaymentIntentId, found.parts, now);
}

/**
 * When a payout lands: every payment and refund in it, on its order (found by the saved payment id). Answers how
 * many orders changed. A line for a payment no order has (a sale made outside the shop) is skipped.
 */
async function recordPayout({ db, payments, mode, payoutId, accountId = null, arrivalDate = null, now }) {
  const { payout, lines } = await payments.payoutMoney({ mode, payoutId, accountId, arrivalDate });
  const byPayment = new Map();
  for (const line of lines) {
    if (!line?.paymentId || !line.key || !line.part) continue;
    const parts = byPayment.get(line.paymentId) || {};
    parts[line.key] = { ...line.part, payoutId: payout.id, payoutDate: payout.date };
    byPayment.set(line.paymentId, parts);
  }
  let changed = 0;
  for (const [paymentId, parts] of byPayment) {
    const found = await db.collection("orders").where("stripePaymentIntentId", "==", paymentId).limit(1).get();
    if (found.empty) continue;
    if (await recordMoney(db, found.docs[0].id, paymentId, parts, now)) changed += 1;
  }
  return changed;
}

module.exports = { moneyUpdate, recordMoney, recordOrderMoney, recordPayout, inOrderCurrency };
