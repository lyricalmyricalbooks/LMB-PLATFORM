// Pay as you sell (code plan 6.19): instead of the monthly price, a press on the Shop or Shop-and-stockroom plan pays a
// share of each website sale, taken as the provider's platform fee (Stripe's application fee, Square's app_fee_money),
// and never more in one billing month than that plan's monthly price. Once the month's fees reach it, the rest of the
// month is free. The stockroom alone stays monthly.
//
// The terms live on the shop's registry row, written by services/billing (paymentWay.js) when the press chooses:
//   payAsYouSell: { basisPoints, capMinor, currency, from, until? }
//     basisPoints  the share, in hundredths of a percent (200 = 2%), after any founding discount
//     capMinor     the most taken in one billing month, in the plan's currency (cents): the plan's monthly price
//     from         when fees start (the end of the trial or of the month already paid); billing months count from it
//     until        when the press goes back to monthly; no fee from then on
//
// What counts: the books in an order (its lines, after discounts), never shipping or tax. A Checkout Session's lines
// are counted except the shop's shipping and tax lines (`product_data.metadata.lmb_line` "shipping" or "tax", or the
// shop's own names for them); a card payment (PaymentIntent) carries its book total in `metadata.lmb_books_minor`.
// Without one, or in another currency than the cap's, the order takes no fee: taking too much from a press is worse
// than taking nothing.
//
// The month's fees are kept in a small ledger (one record per shop per billing month), keyed by the checkout's
// idempotency key, so a retried checkout or a repeated event never counts twice:
//   held       a checkout made with a fee, not paid yet. It counts toward the cap for HOLD_MS, so two checkouts at
//              once can't both take the last of it; one that is never paid stops counting.
//   taken      paid. Its fee less what refunds gave back counts until the month ends.
//   released   the checkout expired or was cancelled.
// A refund gives back its share of the fee (the provider does it: refund_application_fee, Square's refund
// app_fee_money) and lowers the total of the month the fee was taken in, even when the refund comes in a later month.
//
// Ledger store (feeLedgerFakes.js has an in-memory one; Firestore in the platform project, `feeMonths` and
// `feePayments`):
//   get(shopId, month) -> record | null
//   update(shopId, month, fn) -> record: reads the record (or null) and writes fn's answer, atomically (a transaction)
//   link(shopId, paymentId, { month, key }); find(shopId, paymentId) -> { month, key } | null
import { MAX_BASIS_POINTS, feeFor } from "./fees.js";

export const PAY_AS_YOU_SELL_PLANS = Object.freeze(["shop", "both"]);

/** How long a checkout's fee counts toward the cap before it is paid. Stripe's Checkout pages close in 31 minutes. */
export const HOLD_MS = 2 * 60 * 60 * 1000;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const isWhole = (value, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(value) && value >= 0 && value <= max;

/**
 * The terms in force for a shop at `atMs`, from its registry row, or null when the shop pays monthly then (including
 * before `from`: the trial, or the month already paid for). A malformed record throws: the wrong fee is worse than none.
 */
export function activeTerms(row, atMs) {
  const terms = row?.payAsYouSell;
  if (terms === undefined || terms === null) return null;
  if (typeof terms !== "object" || Array.isArray(terms)) throw new Error("the shop's payAsYouSell must be an object");
  if (!PAY_AS_YOU_SELL_PLANS.includes(row.plan)) return null;
  const { basisPoints, capMinor, currency, from, until } = terms;
  if (!isWhole(basisPoints, MAX_BASIS_POINTS)) throw new Error("payAsYouSell.basisPoints must be a whole number from 0 to 10000");
  if (!isWhole(capMinor)) throw new Error("payAsYouSell.capMinor must be a whole number");
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) throw new Error("payAsYouSell.currency must be a three-letter code");
  if (typeof from !== "string" || !ISO.test(from)) throw new Error("payAsYouSell.from must be a time");
  if (until !== undefined && until !== null && (typeof until !== "string" || !ISO.test(until))) throw new Error("payAsYouSell.until must be a time");
  if (atMs < Date.parse(from)) return null;
  if (until && atMs >= Date.parse(until)) return null;
  return { basisPoints, capMinor, currency, from };
}

// One month after another from the anchor, on the same day (the last day of a shorter month), at the same time.
function addMonths(anchorMs, n) {
  const d = new Date(anchorMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

/** The billing month holding `atMs`, counted from `anchor` (the terms' `from`): { key, start, end } (ISO times). */
export function billingMonth(anchor, atMs) {
  const anchorMs = Date.parse(anchor);
  if (!Number.isFinite(anchorMs)) throw new Error("the billing month needs a start");
  const a = new Date(anchorMs);
  const b = new Date(atMs);
  let n = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  while (n > 0 && addMonths(anchorMs, n) > atMs) n -= 1;
  while (addMonths(anchorMs, n + 1) <= atMs) n += 1;
  const start = new Date(addMonths(anchorMs, Math.max(n, 0))).toISOString();
  return { key: start.slice(0, 10), start, end: new Date(addMonths(anchorMs, Math.max(n, 0) + 1)).toISOString() };
}

// The shop's own names for its shipping and tax lines (apps/shop functions/checkoutPayment.js).
const NOT_BOOK_NAMES = new Set(["shipping & handling", "estimated sales tax"]);
const NOT_BOOK_KINDS = new Set(["shipping", "tax"]);

const notBooks = (kind, name) => NOT_BOOK_KINDS.has(kind) || NOT_BOOK_NAMES.has(String(name ?? "").trim().toLowerCase());

/**
 * The books in a Checkout Session, in the smallest unit: every line but shipping and tax. null when it can't be known
 * up front (codes Stripe takes off later, or a line priced another way).
 */
export function sessionBooksMinor(params) {
  if (params?.discounts !== undefined || params?.allow_promotion_codes) return null;
  const items = params?.line_items;
  if (!Array.isArray(items) || !items.length) return null;
  let total = 0;
  for (const item of items) {
    const unit = item?.price_data?.unit_amount;
    const quantity = item?.quantity ?? 1;
    if (!Number.isInteger(unit) || !Number.isInteger(quantity)) return null;
    const product = item.price_data.product_data;
    if (notBooks(product?.metadata?.lmb_line, product?.name)) continue;
    total += unit * quantity;
  }
  return total;
}

/** The books in a card payment: its `metadata.lmb_books_minor`, never more than the payment. null without one. */
export function intentBooksMinor(params) {
  const raw = params?.metadata?.lmb_books_minor;
  if (raw === undefined || raw === null || !/^\d+$/.test(String(raw)) || !Number.isInteger(params?.amount)) return null;
  return Math.min(Number(raw), params.amount);
}

/** The books in a Square checkout's lines (`{ name, quantity, unitAmountMinor, kind? }`), as above. */
export function squareBooksMinor(lineItems) {
  if (!Array.isArray(lineItems)) return null;
  let total = 0;
  for (const line of lineItems) {
    if (notBooks(line?.kind, line?.name)) continue;
    if (!Number.isInteger(line?.unitAmountMinor) || !Number.isInteger(line?.quantity)) return null;
    total += line.unitAmountMinor * line.quantity;
  }
  return total;
}

// ── The month's record ───────────────────────────────────────────────────────────────────────────────────────────

const refundedOf = (entry) => Object.values(entry.refunds ?? {}).reduce((sum, value) => sum + value, 0);

/** What a month's record adds up to at `atMs`: taken (less refunds), still held, and both together. */
export function monthTotals(record, atMs) {
  let takenMinor = 0;
  let refundedMinor = 0;
  let heldMinor = 0;
  for (const entry of Object.values(record?.entries ?? {})) {
    if (entry.state === "taken") {
      takenMinor += entry.feeMinor;
      refundedMinor += Math.min(refundedOf(entry), entry.feeMinor);
    } else if (entry.state === "held" && atMs - Date.parse(entry.heldAt) < HOLD_MS) {
      heldMinor += entry.feeMinor;
    }
  }
  const countedMinor = takenMinor - refundedMinor + heldMinor;
  return { takenMinor, refundedMinor, heldMinor, countedMinor, capMinor: record?.capMinor ?? 0 };
}

/**
 * The fee for one checkout: its share of the books, but only what is left under the cap this month. The same `key`
 * again (a retried checkout) gets the same fee and counts once. Answers { record, feeMinor }.
 */
export function holdFee(record, { shopId, month, capMinor, key, wantMinor, atMs }) {
  const base = record ?? { shopId, month: month.key, start: month.start, end: month.end, capMinor, entries: {} };
  const existing = base.entries[key];
  if (existing) return { record: base, feeMinor: existing.feeMinor };
  const left = Math.max(0, capMinor - monthTotals(base, atMs).countedMinor);
  const feeMinor = Math.min(wantMinor, left);
  const entry = { key, wantMinor, feeMinor, state: "held", heldAt: new Date(atMs).toISOString(), paymentIds: [], refunds: {} };
  return { record: { ...base, entries: { ...base.entries, [key]: entry } }, feeMinor };
}

const withEntry = (record, key, change) => {
  const entry = record?.entries?.[key];
  if (!entry) return record;
  return { ...record, entries: { ...record.entries, [key]: { ...entry, ...change(entry) } } };
};

/** Paid: the fee counts until the month ends. `feeMinor` is what the provider actually took, when it says. */
export const markTaken = (record, key, { feeMinor, atMs }) =>
  withEntry(record, key, (entry) => (entry.state === "taken" && (feeMinor === undefined || feeMinor === entry.feeMinor)
    ? {}
    : { state: "taken", takenAt: entry.takenAt ?? new Date(atMs).toISOString(), ...(isWhole(feeMinor) ? { feeMinor } : {}) }));

/** The checkout expired or was cancelled before it was paid. A paid one stays taken. */
export const markReleased = (record, key) => withEntry(record, key, (entry) => (entry.state === "held" ? { state: "released" } : {}));

/** A refund (or every refund of one charge) gave back `feeBackMinor` of this fee. The same source again replaces it. */
export const markRefunded = (record, key, { sourceId, feeBackMinor }) =>
  withEntry(record, key, (entry) => ({ refunds: { ...(entry.refunds ?? {}), [sourceId]: Math.min(Math.max(0, feeBackMinor), entry.feeMinor) } }));

// ── The ledger the payment service uses ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} deps
 * @param {object} deps.store the ledger store (see the header)
 * @param {() => number} [deps.now]
 */
export function createFeeLedger({ store, now = () => Date.now() }) {
  async function change(shopId, paymentId, fn) {
    if (typeof paymentId !== "string" || !paymentId) return false;
    const ref = await store.find(shopId, paymentId);
    if (!ref) return false;
    await store.update(shopId, ref.month, (record) => fn(record, ref.key));
    return true;
  }

  return {
    /**
     * The fee for one checkout under pay as you sell: { feeMinor, ref } where `ref` is { month, key } to link the
     * provider's ids to once the checkout exists.
     */
    async hold(shopId, terms, { key, booksMinor }) {
      const atMs = now();
      const month = billingMonth(terms.from, atMs);
      const wantMinor = feeFor(booksMinor, terms);
      let feeMinor = 0;
      await store.update(shopId, month.key, (record) => {
        const held = holdFee(record, { shopId, month, capMinor: terms.capMinor, key, wantMinor, atMs });
        feeMinor = held.feeMinor;
        return held.record;
      });
      return { feeMinor, ref: { month: month.key, key } };
    },

    /** The provider's ids for a checkout (a payment, a Checkout Session, a Square order or payment). */
    async link(shopId, ids, ref) {
      for (const id of ids) if (typeof id === "string" && id) await store.link(shopId, id, ref);
    },

    /** A payment went through. `alsoIds` are more of its ids (a session's payment), linked for its refunds. */
    async paid(shopId, paymentId, { feeMinor, alsoIds = [] } = {}) {
      const ref = typeof paymentId === "string" && paymentId ? await store.find(shopId, paymentId) : null;
      if (!ref) return false;
      for (const id of alsoIds) if (typeof id === "string" && id) await store.link(shopId, id, ref);
      await store.update(shopId, ref.month, (record) => markTaken(record, ref.key, { feeMinor, atMs: now() }));
      return true;
    },

    released: (shopId, paymentId) => change(shopId, paymentId, (record, key) => markReleased(record, key)),

    /**
     * A refund on a payment. Either the fee given back (Square says it), or what has been refunded of what total
     * (Stripe's charge), from which the same share of the fee is worked out, rounded down.
     */
    refunded: (shopId, paymentId, { sourceId, feeBackMinor, refundedMinor, totalMinor }) =>
      change(shopId, paymentId, (record, key) => {
        const entry = record?.entries?.[key];
        if (!entry) return record;
        const back = isWhole(feeBackMinor)
          ? feeBackMinor
          : isWhole(refundedMinor) && Number.isInteger(totalMinor) && totalMinor > 0 ? Math.floor((entry.feeMinor * Math.min(refundedMinor, totalMinor)) / totalMinor) : 0;
        return markRefunded(record, key, { sourceId, feeBackMinor: back });
      }),

    /** The month so far, for the Plan & billing page: { month, takenMinor, refundedMinor, heldMinor, countedMinor, capMinor }. */
    async monthSoFar(shopId, terms) {
      const atMs = now();
      const month = billingMonth(terms.from, atMs);
      const record = await store.get(shopId, month.key);
      return { month, ...monthTotals(record, atMs), capMinor: terms.capMinor };
    },
  };
}
