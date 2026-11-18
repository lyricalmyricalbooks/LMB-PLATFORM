// Memberships & subscriptions (beta; LMB-PLATFORM tasks/todo/2026-11-18-memberships-m1.md): what a plan may be and what
// a member's state means. One source for the admin, the shop's Membership page and account, and the server
// (functions/shared/membershipRules.js is a generated copy; functions/memberships.js keeps the records).
//
// A plan is paid every month or every year on the shop's own card account, with an optional free trial. A member's
// state comes from the card provider's subscription (memberState), never from the browser.

export const MAX_PLANS = 8;
export const MAX_PLAN_NAME = 60;
export const MAX_PLAN_DESCRIPTION = 400;
export const MAX_PERKS = 8;
export const MAX_PERK = 100;
/** The lowest price: below this the card fee eats most of it. */
export const MIN_PLAN_MINOR = 200;
/** The highest price one payment takes. */
export const MAX_PLAN_MINOR = 500_000;
export const MAX_TRIAL_DAYS = 60;
/** The most a plan can take off the shop's prices for its members (M2a). */
export const MAX_MEMBER_PERCENT = 50;

export type PlanInterval = "month" | "year";
export const PLAN_INTERVALS: readonly PlanInterval[] = Object.freeze(["month", "year"]);

export type MembershipPlan = {
  name: string;
  description: string;
  /** What members get, one line each, shown as a list. */
  perks: string[];
  interval: PlanInterval;
  priceMinor: number;
  /** Days free before the first payment (0: pays at once). */
  trialDays: number;
  /** A hidden plan takes no new members; its members stay. */
  hidden: boolean;
  /** Whole percent off the shop's products for its members at checkout (0: none). The server applies it (M2a). */
  memberPercent: number;
};

export const PLAN_MESSAGES = Object.freeze({
  name: "Give the plan a name.",
  interval: "Choose monthly or yearly.",
  price: (min: string, max: string) => `Enter a price from ${min} to ${max}.`,
  trial: `A free trial can be up to ${MAX_TRIAL_DAYS} days.`,
  percent: `A member price can take 0 to ${MAX_MEMBER_PERCENT}% off.`,
});

const text = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** The owner's plan, cleaned, or the first problem with the field it is about. Prices are whole cents. Pure. */
export function cleanPlan(raw: unknown): { plan: MembershipPlan } | { problem: string; field: "name" | "interval" | "price" | "trial" | "percent" } {
  const p = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const name = text(p.name, MAX_PLAN_NAME);
  if (!name) return { problem: PLAN_MESSAGES.name, field: "name" };
  const interval = p.interval === "year" ? "year" : p.interval === "month" ? "month" : null;
  if (!interval) return { problem: PLAN_MESSAGES.interval, field: "interval" };
  const priceMinor = Number(p.priceMinor);
  if (!Number.isInteger(priceMinor) || priceMinor < MIN_PLAN_MINOR || priceMinor > MAX_PLAN_MINOR) {
    return { problem: PLAN_MESSAGES.price(`$${(MIN_PLAN_MINOR / 100).toFixed(2)}`, `$${(MAX_PLAN_MINOR / 100).toLocaleString("en-CA")}`), field: "price" };
  }
  const trialDays = p.trialDays === undefined || p.trialDays === "" || p.trialDays === null ? 0 : Number(p.trialDays);
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > MAX_TRIAL_DAYS) return { problem: PLAN_MESSAGES.trial, field: "trial" };
  const memberPercent = p.memberPercent === undefined || p.memberPercent === "" || p.memberPercent === null ? 0 : Number(p.memberPercent);
  if (!Number.isInteger(memberPercent) || memberPercent < 0 || memberPercent > MAX_MEMBER_PERCENT) return { problem: PLAN_MESSAGES.percent, field: "percent" };
  const perks = (Array.isArray(p.perks) ? p.perks : []).map((x) => text(x, MAX_PERK)).filter(Boolean).slice(0, MAX_PERKS);
  return { plan: { name, description: String(p.description ?? "").replace(/\r\n?/g, "\n").trim().slice(0, MAX_PLAN_DESCRIPTION), perks, interval, priceMinor, trialDays, hidden: p.hidden === true, memberPercent } };
}

/**
 * Where a member stands:
 *   pending   the card page is open and nothing is paid yet
 *   trial     in the free trial
 *   active    paid up
 *   pastDue   a payment failed; the card provider is trying again and the member keeps their perks meanwhile
 *   ending    asked to end; perks last to the end of the paid period
 *   ended     over (ended at the period's end, ended at once, or never paid)
 */
export type MemberState = "pending" | "trial" | "active" | "pastDue" | "ending" | "ended";

/** A member's state from the provider's subscription status (Stripe's words). Pure. */
export function memberState(status: unknown, cancelAtPeriodEnd = false): MemberState {
  switch (String(status || "")) {
    case "trialing": return cancelAtPeriodEnd ? "ending" : "trial";
    case "active": return cancelAtPeriodEnd ? "ending" : "active";
    case "past_due":
    case "unpaid":
    case "paused": return "pastDue";
    case "incomplete": return "pending";
    case "incomplete_expired":
    case "canceled": return "ended";
    default: return "pending";
  }
}

/** Whether a member gets their perks now: a trial, paid up, ending later, or a failed payment still being retried. */
export const hasPerks = (state: MemberState) => state === "trial" || state === "active" || state === "ending" || state === "pastDue";

/** Whether this person may join again: only once their last membership has ended (or never started). */
export const mayJoin = (states: readonly MemberState[]) => states.every((s) => s === "ended" || s === "pending");

/** "$15.00 a month", "$150.00 a year" (English) or "15,00 $ par mois" (French). Pure. */
export function planPriceWords(priceMinor: number, interval: PlanInterval, currency = "CAD", locale = "en-CA") {
  const fr = /^fr/i.test(locale);
  const money = new Intl.NumberFormat(fr ? "fr-CA" : "en-CA", { style: "currency", currency: String(currency || "CAD").toUpperCase() }).format(priceMinor / 100);
  if (fr) return `${money} par ${interval === "year" ? "année" : "mois"}`;
  return `${money} a ${interval}`;
}

/**
 * A product's member price: the shop's unit price less the plan's percent, to the cent (rounded half up), never below
 * zero. 0 percent, or a price that isn't a number, gives the price back. Pure; the server uses it in priceOrder (M2a).
 */
export function memberUnitPrice(price: number, percent: number): number {
  if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(percent) || percent <= 0) return price;
  const cents = Math.round(price * 100);
  return Math.max(0, Math.round(cents * (100 - Math.min(percent, MAX_MEMBER_PERCENT)) / 100)) / 100;
}
