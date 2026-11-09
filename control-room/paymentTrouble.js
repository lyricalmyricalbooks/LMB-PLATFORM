// Failed plan payments (code plan 19.9): every shop whose plan payment is failing, unpaid or paused for a card, with how
// long it has been so and how long is left before the shop closes. Pure reading of the registry rows (`billing`, kept in
// step by services/billing; `closing`, by the closing sweep). The test shop never counts.
//
// The dates follow the closing sweep's rules (services/billing/closing.js, decided by Julian on 28 October 2026): a
// paused plan closes the shop PAUSED_DAYS after the pause began, and the press can then download everything for
// DOWNLOAD_DAYS. A payment still being tried again (past due) keeps the shop open, so it has no closing date yet:
// when the payment company stops trying, the plan pauses and the 60 days start.
//
// Order: the shops with a closing date first, fewest days left first; then the ones still being tried, longest first.
import { DOWNLOAD_DAYS, PAUSED_DAYS } from "../services/billing/closing.js";

const DAY = 86_400_000;
const STATE_WORDS = { past_due: "Payment failing", unpaid: "Unpaid", incomplete: "Waiting for a first payment", paused: "Paused for a card" };
const PROBLEM = new Set(["past_due", "unpaid", "incomplete", "paused"]);

export function paymentTrouble(rows, now = new Date()) {
  const nowMs = now.getTime();
  const list = [];
  for (const row of rows) {
    const billing = row.billing ?? {};
    if (row.testShop === true || billing.access === "closed") continue;
    if (!PROBLEM.has(billing.status) && billing.access !== "paused") continue;
    const paused = billing.access === "paused";
    const pausedAt = row.closing?.stage === "paused" ? row.closing.pausedAt : null;
    const since = pausedAt ?? billing.troubleSince ?? billing.updatedAt ?? null;
    const closesAt = paused && since ? new Date(Date.parse(since) + PAUSED_DAYS * DAY).toISOString() : null;
    list.push({
      shopId: row.shopId,
      pressName: row.pressName ?? row.shopId,
      ownerEmail: row.ownerEmail ?? null,
      status: billing.status ?? null,
      state: STATE_WORDS[billing.status] ?? "Paused for a card",
      open: !paused,
      since,
      daysSince: since ? Math.max(0, Math.floor((nowMs - Date.parse(since)) / DAY)) : null,
      closesAt,
      daysLeft: closesAt ? Math.max(0, Math.ceil((Date.parse(closesAt) - nowMs) / DAY)) : null,
      downloadUntil: closesAt ? new Date(Date.parse(closesAt) + DOWNLOAD_DAYS * DAY).toISOString() : null,
    });
  }
  return list.sort((a, b) => {
    if (a.daysLeft !== null && b.daysLeft !== null) return a.daysLeft - b.daysLeft || a.pressName.localeCompare(b.pressName);
    if (a.daysLeft !== null) return -1;
    if (b.daysLeft !== null) return 1;
    return (b.daysSince ?? 0) - (a.daysSince ?? 0) || a.pressName.localeCompare(b.pressName);
  });
}
