// The card form's remembered attempt: one order + PaymentIntent that a retry with the same bag reuses.

/**
 * The server holds stock and gift-card amounts for 30 minutes (functions/stockHolds.js HOLD_MS).
 * A PaymentIntent older than this is not confirmed again: Pay asks the server for a fresh one on the
 * same order, which re-prices it, renews the holds and cancels the old intent.
 */
export const CARD_ATTEMPT_REUSE_MS = 25 * 60 * 1000;

export type PendingCardOrder = {
  key: string;
  orderId: string;
  clientSecret: string;
  /** When the server created this PaymentIntent (ms). */
  createdAt: number;
  /** The intent's own amount (minor units) and currency: what the card form must confirm. */
  amount?: number;
  currency?: string;
};

/**
 * What a retry may reuse. A different bag reuses nothing. The same bag keeps its order, and keeps the
 * PaymentIntent only while it is younger than CARD_ATTEMPT_REUSE_MS (its holds are still alive).
 */
export function reusableCardOrder(pending: PendingCardOrder | null | undefined, key: string, now = Date.now()): PendingCardOrder | null {
  if (!pending || pending.key !== key) return null;
  const fresh = pending.clientSecret && Number.isFinite(pending.createdAt) && now - pending.createdAt < CARD_ATTEMPT_REUSE_MS;
  return fresh ? pending : { key: pending.key, orderId: pending.orderId, clientSecret: "", createdAt: now };
}

/** `pi_123_secret_abc` → `pi_123` (the status check names the intent). */
export function intentIdOf(clientSecret: string): string {
  const match = /^(pi_[A-Za-z0-9]+)_secret_/.exec(String(clientSecret || ""));
  return match ? match[1] : "";
}

/** A Stripe confirm error that says nothing about the card: the payment may already have gone through. */
export function mayHaveGoneThrough(errorType: string | undefined): boolean {
  return Boolean(errorType) && errorType !== "card_error" && errorType !== "validation_error";
}

/** Status-check answers that mean the money is taken (or on its way): show the order, never charge again. */
export function paymentSettled(status: string | undefined): boolean {
  return status === "complete" || status === "processing";
}

/**
 * Everything on the order that a retry must match to reuse the earlier unpaid order. The gift
 * message / order note is included: an edited note must make a fresh order rather than silently
 * paying for the old text.
 */
export function cardAttemptKey(parts: {
  items: unknown; total: unknown; customer: unknown; currency: string; fulfillmentSelection: unknown;
  discountCode?: string | null; giftCardCodes?: string[]; orderNote?: string | null; addressVerified?: boolean;
}): string {
  return JSON.stringify([
    parts.items, parts.total, parts.customer, parts.currency, parts.fulfillmentSelection,
    parts.discountCode || null, parts.giftCardCodes || [], parts.orderNote || "", Boolean(parts.addressVerified),
  ]);
}
