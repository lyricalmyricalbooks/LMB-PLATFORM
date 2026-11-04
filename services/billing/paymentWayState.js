// How a shop pays at a given time (code plan 6.19), from its billing record. Kept apart from paymentWay.js so billing.js
// can use it without importing that file (which imports billing.js).
import { billingMonth } from "../payments/payAsYouSell.js";

const ENDED = new Set(["canceled", "incomplete_expired"]);

/** The way a shop pays at `atMs`, from its billing record. A switch that hasn't started yet still shows the old way. */
export function currentPaymentWay(row, atMs) {
  if (row?.paymentWay === "payAsYouSell") return row.paymentWayFrom && atMs < Date.parse(row.paymentWayFrom) ? "monthly" : "payAsYouSell";
  if (row?.payAsYouSell?.until && atMs < Date.parse(row.payAsYouSell.until)) return "payAsYouSell";
  return "monthly";
}

/**
 * The shop's access when it pays as it sells: open, though its subscription has ended (that is the point), until the
 * terms' `until` (the press cancelled, or moved to monthly). Null when the usual rule (ACCESS) applies. billing.js's
 * save() uses it.
 */
export function payAsYouSellAccess(row, atMs, usual) {
  const until = row?.payAsYouSell?.until;
  const chosen = until ? atMs < Date.parse(until) : row?.paymentWay === "payAsYouSell";
  return chosen && usual !== "open" ? "open" : null;
}

/** A press paying as they sell who cancelled: the day their terms stop and the shop closes. Null otherwise. */
export const payAsYouSellEnds = (row) => (row?.paymentWay === "payAsYouSell" && row.payAsYouSell?.until) || null;

/**
 * Has the press asked for the plan to end, and when does it end? For a press paying as they sell, Stripe's own cancel
 * is the switch itself (no subscription runs while they do), so only their own cancel (`payAsYouSell.until`) counts.
 * The Plan & billing pages, the registry's copy and the shop's copy say "cancelled" from this, never from Stripe's flag.
 */
export function planEnding(row) {
  if (row?.paymentWay === "payAsYouSell") {
    const until = payAsYouSellEnds(row);
    return { cancelling: Boolean(until), endsAt: until };
  }
  const cancelling = Boolean(row?.cancelAtPeriodEnd);
  return { cancelling, endsAt: cancelling && !ENDED.has(row.status) ? (row.status === "trialing" ? row.trialEnd : row.currentPeriodEnd) ?? null : null };
}

/**
 * The day a cancel asked for at `atMs` closes the shop: the end of the trial or of the month already paid for. For a
 * press paying as they sell, the day fees start (so nothing is ever taken), or else the end of the current billing month.
 */
export function cancelEndsAt(row, atMs) {
  if (row?.paymentWay === "payAsYouSell" && row.payAsYouSell?.from) {
    if (row.payAsYouSell.until) return row.payAsYouSell.until;
    return atMs < Date.parse(row.payAsYouSell.from) ? row.payAsYouSell.from : billingMonth(row.payAsYouSell.from, atMs).end;
  }
  return (row?.status === "trialing" ? row.trialEnd : row?.currentPeriodEnd) ?? null;
}
