// Close your shop (Settings › Close shop, #settings/close): the plain words and the rules behind CloseShopCard.tsx. The
// timeline follows the closing Julian chose on 28 October 2026 (services/billing/closing.js): the shop closes to
// shoppers, there are 90 days to download everything or open it again, reminders go 30 and 7 days before, then it's
// deleted. Since 18 November 2026 one Close shop button does it (the platform's `close` call): a month already paid
// for runs to its end first; a free trial or a failed payment closes today. An unpaid plan pauses for 60 days first.
import type { BillingStatus } from "./platformBilling";

const DAY = 86400_000;
/** Days a closed shop keeps everything before it's deleted (services/billing/closing.js DOWNLOAD_DAYS). */
export const KEEP_DAYS = 90;

/** What happens after a close, for the help answer and the tests: the closing the platform runs. */
export const CLOSING_STEPS: ReadonlyArray<{ when: string; what: string }> = [
  { when: "When it closes", what: "Shoppers see a closed page. You can still sign in, download everything or open it again." },
  { when: "30 and 7 days before the end", what: "We email you a reminder." },
  { when: "After 90 days", what: "Your shop and everything in it are deleted for good." },
  { when: "If a payment fails instead", what: "Your shop pauses for 60 days first. Adding a card opens it again." },
];

/** Where the shop stands, for the card: what it shows and which button it offers. */
export type CloseStage = "loading" | "unknown" | "none" | "open" | "cancelled" | "closed";

export function closeShopStage(
  billing: Pick<BillingStatus, "access" | "cancelAtPeriodEnd"> | null,
  read: { loaded: boolean; failed: boolean },
): CloseStage {
  if (!read.loaded) return read.failed ? "unknown" : "loading";
  if (!billing) return "none";
  if (billing.access === "closed") return "closed";
  return billing.cancelAtPeriodEnd ? "cancelled" : "open";
}

/**
 * When Close shop closes the shop: the end of the month paid for (an active plan, or one paying as it sells), else
 * today. The platform's own rule is accounts/billingRoutes.js closesLater; this one only words the button.
 */
export function closesOn(billing: Pick<BillingStatus, "status" | "access" | "paymentWay" | "cancelEndsAt" | "currentPeriodEnd" | "trialEnd">): string | null {
  const later = billing.paymentWay === "payAsYouSell" || (billing.status === "active" && billing.access === "open");
  if (!later) return null;
  return billing.cancelEndsAt ?? billing.currentPeriodEnd ?? null;
}

/** The day everything is deleted when the shop closes on `closes` (today when null). */
export function deletedOn(closes: string | null, now = Date.now()): string {
  const from = closes ? Date.parse(closes) : now;
  return new Date((Number.isNaN(from) ? now : from) + KEEP_DAYS * DAY).toISOString();
}
