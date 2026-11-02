// Card-expiry warnings (code plan 6.12, made a nightly job in 19.9). A month before the card on file runs out, the
// person who pays for the plan is emailed (`card-expiring`, services/email/templates.js), once per card and expiry: a
// new card, or the same card given a new expiry date by the card company (Stripe's card updater, which keeps the
// card's id), gets its own email when its time comes. Only for a plan that is still running (a free trial, a paid
// month or a payment being retried) and not cancelled: a plan that ended, is paused or is set to end gets nothing.
//
// The sweep itself is billing.js `cardExpiryReminders()`, which sends through the billing service's own emails and logs
// each one in the registry and the shop's audit log ("card-expiring-sent"); this file decides who is due. The nightly
// run (control-room/nightly.js) calls it.

const DAY = 86400_000;
/** How long before a card runs out the press is told. */
export const CARD_WARNING_DAYS = 30;
/** The plans a warning is for: still running. */
const RUNNING = new Set(["trialing", "active", "past_due"]);

/** The last moment a card works: the end of its expiry month, in UTC. */
export function cardEnds({ expMonth, expYear }) {
  if (!Number.isInteger(expMonth) || !Number.isInteger(expYear)) return null;
  return new Date(Date.UTC(expYear, expMonth, 1) - 1).toISOString();
}

/** One warning per card and expiry: "pm_123@2027-02". */
export function cardWarningKey(card) {
  return `${card.id}@${card.expYear}-${String(card.expMonth).padStart(2, "0")}`;
}

/**
 * Whether one billing row's card is due its warning at `nowMs`: { ends, key } or null. Due when the plan is running and
 * not cancelled, the card runs out within CARD_WARNING_DAYS (and hasn't already), and this card and expiry haven't been
 * warned about (`row.cardWarned`).
 */
export function cardWarningDue(row, nowMs) {
  if (!RUNNING.has(row?.status) || row.cancelAtPeriodEnd || !row.hasCard || !row.card?.id) return null;
  const ends = cardEnds(row.card);
  if (!ends) return null;
  const left = Date.parse(ends) - nowMs;
  if (left < 0 || left > CARD_WARNING_DAYS * DAY) return null;
  const key = cardWarningKey(row.card);
  return row.cardWarned === key ? null : { ends, key };
}
