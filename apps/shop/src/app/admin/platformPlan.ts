// The shop's plan on the platform (code plan 6.6, 6.7). Pure and tested (platformPlan.test.ts).
//
// The platform's billing writes the admin-only `platform/plan` document into the shop's database on every billing
// change (services/billing/shopPlan.js in the platform repo); no browser can write it (firestore.rules). The admin reads
// it for the trial banner, the payment-problem banner and Settings › Plan; all of them link to the platform's Plan &
// billing page, whose address the document carries. A paused or closed plan locks the admin to Plan & billing and the
// downloads (PlanDesk.tsx). A shop with no such document isn't on a plan: no banner, nothing locked.
//
// Admin-only words (the Studio rule covers shopper-facing words). Plain words: no technical terms.

export type PlanState = "trial" | "active" | "payment-problem" | "paused" | "closed";
export type PlanAccess = "open" | "paused" | "closed";

export type PlatformPlan = {
  plan: "shop" | "stockroom" | "both" | null;
  state: PlanState;
  access: PlanAccess;
  trialEnd: string | null;
  nextPaymentAt: string | null;
  hasCard: boolean;
  cancelAtPeriodEnd: boolean;
  endsAt: string | null;
  paymentWay: "monthly";
  link: string | null;
  closing: { stage: string; closedAt: string | null; downloadUntil: string | null; deleteAfter: string | null } | null;
};

export const PLAN_NAMES: Record<string, string> = { shop: "Shop", stockroom: "Stockroom", both: "Shop and stockroom" };
const STATES: PlanState[] = ["trial", "active", "payment-problem", "paused", "closed"];
const DAY = 86400_000;

const time = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
// Only an https address is ever used as a link, whatever the document holds.
const httpsLink = (v: unknown): string | null => (typeof v === "string" && /^https:\/\/[^\s<>"']+$/.test(v) ? v : null);

/** The document as the admin may trust it, or null when there is none (or it can't be read as a plan). */
export function parsePlatformPlan(raw: any): PlatformPlan | null {
  if (!raw || typeof raw !== "object" || !STATES.includes(raw.state)) return null;
  // Anything but a plain "open" counts as not open: a broken document never opens a paused shop.
  const access: PlanAccess = raw.access === "open" ? "open" : raw.access === "closed" ? "closed" : "paused";
  const closing = raw.closing && typeof raw.closing === "object"
    ? { stage: String(raw.closing.stage || ""), closedAt: time(raw.closing.closedAt), downloadUntil: time(raw.closing.downloadUntil), deleteAfter: time(raw.closing.deleteAfter) }
    : null;
  return {
    plan: raw.plan === "shop" || raw.plan === "stockroom" || raw.plan === "both" ? raw.plan : null,
    state: access === "open" ? raw.state : access,
    access,
    trialEnd: time(raw.trialEnd),
    nextPaymentAt: time(raw.nextPaymentAt),
    hasCard: raw.hasCard === true,
    cancelAtPeriodEnd: raw.cancelAtPeriodEnd === true,
    endsAt: time(raw.endsAt),
    paymentWay: "monthly",
    link: httpsLink(raw.link),
    closing,
  };
}

/** A paused or closed plan: the admin opens on Plan & billing only. */
export const planLocked = (plan: PlatformPlan | null): boolean => !!plan && plan.access !== "open";

/** Whole days left until `iso` (a part day counts as a day), never below 0. */
export function daysLeft(iso: string | null, now = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / DAY));
}

/** "14 November 2026", Toronto time (the platform's emails say dates the same way). */
export function planDate(iso: string | null): string {
  if (!iso) return "";
  // Put together from parts: browsers order "en-CA" long dates differently.
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", day: "numeric", month: "long", year: "numeric" }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")}`;
}

export type PlanBanner = { tone: "info" | "warning" | "danger"; kicker: string; title: string; detail: string; action: string };

/** The banner over every admin page, or null when there is nothing to say (an active plan, or no plan at all). */
export function planBanner(plan: PlatformPlan | null, now = Date.now()): PlanBanner | null {
  if (!plan) return null;
  if (plan.state === "closed") {
    const until = plan.closing?.downloadUntil;
    return {
      tone: "danger", kicker: "Plan", title: "Your shop is closed.",
      detail: until
        ? `Download your books, orders and customers before ${planDate(until)}. After that the shop and everything in it are deleted. Start a plan again before then to open it as it was.`
        : "Start a plan again to open it as it was.",
      action: "See your plan",
    };
  }
  if (plan.state === "paused") {
    return {
      tone: "danger", kicker: "Plan", title: "Your shop is paused.",
      detail: "Shoppers see a short-break page and can't place orders. Add a card and it opens again within a minute. Nothing has been deleted.",
      action: "Add a card",
    };
  }
  if (plan.state === "payment-problem") {
    return {
      tone: "danger", kicker: "Plan", title: "We couldn't take this month's payment.",
      detail: "Your shop stays open while we try the card again. Update your card so it stays open.",
      action: "Update your card",
    };
  }
  if (plan.cancelAtPeriodEnd && plan.endsAt) {
    return {
      tone: "warning", kicker: "Plan", title: `Your plan ends on ${planDate(plan.endsAt)}.`,
      detail: "Your shop closes then. Changed your mind? Keep your plan with one click.",
      action: "Keep my plan",
    };
  }
  if (plan.state === "trial") {
    const left = daysLeft(plan.trialEnd, now);
    const title = left <= 1 ? "Free trial: last day." : `Free trial: ${left} days left.`;
    return plan.hasCard
      ? { tone: "info", kicker: "Plan", title, detail: plan.nextPaymentAt ? `Your first payment is on ${planDate(plan.nextPaymentAt)}.` : "Your card is saved.", action: "See your plan" }
      : { tone: left <= 3 ? "warning" : "info", kicker: "Plan", title, detail: "Add a card to keep your shop open when the trial ends. You won't be charged until then.", action: "Add a card" };
  }
  return null;
}

/** Settings › Plan: one line per fact, in order. */
export function planFacts(plan: PlatformPlan, now = Date.now()): Array<{ label: string; value: string }> {
  const facts = [{ label: "Plan", value: plan.plan ? PLAN_NAMES[plan.plan] : "Not chosen yet" }];
  const words: Record<PlanState, string> = { trial: "Free trial", active: "Paid and open", "payment-problem": "Payment declined", paused: "Paused", closed: "Closed" };
  facts.push({ label: "Where it is", value: words[plan.state] });
  if (plan.state === "trial" && plan.trialEnd) facts.push({ label: "Trial ends", value: `${planDate(plan.trialEnd)} (${daysLeft(plan.trialEnd, now) <= 1 ? "last day" : `${daysLeft(plan.trialEnd, now)} days left`})` });
  if (plan.nextPaymentAt) facts.push({ label: "Next payment", value: planDate(plan.nextPaymentAt) });
  if (plan.cancelAtPeriodEnd && plan.endsAt) facts.push({ label: "Plan ends", value: planDate(plan.endsAt) });
  if (plan.closing?.downloadUntil) facts.push({ label: "Download until", value: planDate(plan.closing.downloadUntil) });
  if (plan.closing?.deleteAfter) facts.push({ label: "Deleted on", value: planDate(plan.closing.deleteAfter) });
  facts.push({ label: "Card on file", value: plan.hasCard ? "Yes" : "No card yet" });
  facts.push({ label: "How you pay", value: "Monthly" });
  return facts;
}
