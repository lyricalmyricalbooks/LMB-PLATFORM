// Close your shop (Settings › Billing): the plain words and the one rule behind CloseShopCard.tsx. The timeline follows
// the closing Julian chose on 28 October 2026 (services/billing/closing.js): a cancelled plan runs to the end of the
// time paid for, then the shop closes with 90 days to download, warnings 30 and 7 days before, then it's deleted.
// An unpaid plan pauses for 60 days before it closes.
import type { BillingStatus } from "./platformBilling";

export const CLOSING_STEPS: ReadonlyArray<{ when: string; what: string }> = [
  { when: "Until your paid time ends", what: "Your shop stays open as normal. You can change your mind." },
  { when: "The next 90 days", what: "Your shop is closed to shoppers. You can still sign in, download everything or start again." },
  { when: "30 and 7 days before the end", what: "We email you a reminder." },
  { when: "After 90 days", what: "Your shop and everything in it are deleted for good." },
  { when: "If a payment fails instead", what: "Your shop pauses for 60 days first. Adding a card opens it again." },
];

/** Where the plan stands for step 2: what the card shows. */
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
