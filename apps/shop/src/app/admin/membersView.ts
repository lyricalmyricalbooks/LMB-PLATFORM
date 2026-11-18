// Admin › Members (beta): the words and small sums the page shows. Pure, so membersView.test.ts covers them.
import { MAX_PLAN_MINOR, MIN_PLAN_MINOR, MAX_TRIAL_DAYS, MAX_MEMBER_PERCENT, cleanBox, dayOrdinal, type BoxAddress, type MemberState, type PlanBox, type PlanInterval } from "../../shared/membershipRules";
import type { AdminMember, PlanInput } from "./membersApi";
import { dayText } from "./givingView";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** The badge for a member's state. */
export function stateBadge(state: MemberState): { label: string; tone: Tone } {
  switch (state) {
    case "trial": return { label: "Free trial", tone: "info" };
    case "active": return { label: "Active", tone: "success" };
    case "pastDue": return { label: "Payment failed", tone: "danger" };
    case "ending": return { label: "Ending", tone: "warning" };
    case "ended": return { label: "Ended", tone: "neutral" };
    default: return { label: "Not paid yet", tone: "neutral" };
  }
}

/** "a month" / "a year". */
export const everyText = (interval: PlanInterval) => (interval === "year" ? "a year" : "a month");

/** The line under a member's name: what happens next, in plain words. */
export function nextText(m: Pick<AdminMember, "state" | "periodEnd" | "trialEnd" | "endedAt">): string {
  if (m.state === "trial") return m.trialEnd ? `Trial ends ${dayText(m.trialEnd)}, first payment then` : "In the free trial";
  if (m.state === "active") return m.periodEnd ? `Next payment ${dayText(m.periodEnd)}` : "Paid up";
  if (m.state === "pastDue") return "The card provider is trying the card again over the next few days";
  if (m.state === "ending") return m.periodEnd ? `Ends ${dayText(m.periodEnd)}, no more payments` : "Set to end";
  if (m.state === "ended") return m.endedAt ? `Ended ${dayText(m.endedAt)}` : "Ended";
  return "Hasn't finished paying";
}

/** A price typed by the owner ("15", "$150.00"), in cents, or why it can't be one. */
export function planPriceFromText(raw: string, money: (minor: number) => string): { minor: number } | { problem: string } {
  const cleaned = raw.replace(/[$\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { problem: "Type a price, like 15 or 12.50." };
  const minor = Math.round(Number(cleaned) * 100);
  if (minor < MIN_PLAN_MINOR || minor > MAX_PLAN_MINOR) return { problem: `Enter a price from ${money(MIN_PLAN_MINOR)} to ${money(MAX_PLAN_MINOR)}.` };
  return { minor };
}

/** Trial days typed by the owner ("" is none). */
export function trialFromText(raw: string): { days: number } | { problem: string } {
  const t = raw.trim();
  if (!t) return { days: 0 };
  if (!/^\d+$/.test(t) || Number(t) > MAX_TRIAL_DAYS) return { problem: `Type 0 to ${MAX_TRIAL_DAYS} days.` };
  return { days: Number(t) };
}

/** A member price's percent typed by the owner ("" is none; a trailing % is fine). */
export function percentFromText(raw: string): { percent: number } | { problem: string } {
  const t = raw.trim().replace(/\s*%$/, "");
  if (!t) return { percent: 0 };
  if (!/^\d+$/.test(t) || Number(t) > MAX_MEMBER_PERCENT) return { problem: `Type a whole number from 0 to ${MAX_MEMBER_PERCENT}.` };
  return { percent: Number(t) };
}

/** The plan form's text fields. */
/** One product row in a box plan's form (M3a): a product, maybe one of its editions, and how many as typed. */
export type BoxRow = { bookId: string; variantId: string; quantity: string };
export type PlanForm = {
  name: string; description: string; perks: string; interval: PlanInterval; price: string; trial: string; percent: string; hidden: boolean;
  /** Ships a box every month: its product rows and the cut-off day as typed. */
  boxOn: boolean; boxRows: BoxRow[]; cutoff: string;
};
export const blankBoxRow = (): BoxRow => ({ bookId: "", variantId: "", quantity: "1" });
export const blankPlanForm = (): PlanForm => ({ name: "", description: "", perks: "", interval: "month", price: "", trial: "", percent: "", hidden: false, boxOn: false, boxRows: [blankBoxRow()], cutoff: "15" });
export function planFormOf(p: { name: string; description: string; perks: string[]; interval: PlanInterval; priceMinor: number; trialDays: number; hidden: boolean; memberPercent?: number; box?: PlanBox }): PlanForm {
  return {
    name: p.name, description: p.description, perks: p.perks.join("\n"), interval: p.interval, price: (p.priceMinor / 100).toFixed(2), trial: p.trialDays ? String(p.trialDays) : "", percent: p.memberPercent ? String(p.memberPercent) : "", hidden: p.hidden,
    boxOn: !!p.box, boxRows: p.box ? p.box.items.map((i) => ({ bookId: i.bookId, variantId: i.variantId || "", quantity: String(i.quantity) })) : [blankBoxRow()], cutoff: p.box ? String(p.box.cutoffDay) : "15",
  };
}
/** The form as the server takes it, or the first problem and its field. */
export function planFromForm(form: PlanForm, money: (minor: number) => string): { plan: PlanInput } | { problem: string; field: "name" | "price" | "trial" | "percent" | "box" } {
  if (!form.name.trim()) return { problem: "Give the plan a name.", field: "name" };
  const price = planPriceFromText(form.price, money);
  if ("problem" in price) return { problem: price.problem, field: "price" };
  const trial = trialFromText(form.trial);
  if ("problem" in trial) return { problem: trial.problem, field: "trial" };
  const percent = percentFromText(form.percent);
  if ("problem" in percent) return { problem: percent.problem, field: "percent" };
  const perks = form.perks.split("\n").map((l) => l.trim()).filter(Boolean);
  let box: PlanBox | null = null;
  if (form.boxOn) {
    // A row with no product chosen is left out, so an extra empty row never blocks the save.
    const items = form.boxRows.filter((r) => r.bookId).map((r) => ({ bookId: r.bookId, ...(r.variantId ? { variantId: r.variantId } : {}), quantity: r.quantity.trim() === "" ? 1 : Number(r.quantity) }));
    const clean = cleanBox({ items, cutoffDay: Number(form.cutoff) });
    if ("problem" in clean) return { problem: clean.problem, field: "box" };
    box = clean.box;
  }
  return { plan: { name: form.name.trim(), description: form.description.trim(), perks, interval: form.interval, priceMinor: price.minor, trialDays: trial.days, hidden: form.hidden, memberPercent: percent.percent, box } };
}

/** "A box of 3 things on the 15th of each month" for a plan card. */
export function boxText(box: PlanBox): string {
  const count = box.items.reduce((n, i) => n + i.quantity, 0);
  return `A box of ${count} ${count === 1 ? "thing" : "things"}, made on the ${ordinal(box.cutoffDay)} of each month`;
}

/** 1st, 2nd, 3rd, 4th … 28th. */
export const ordinal = dayOrdinal;

/** One line for where a member's boxes go. */
export const addressText = (a: BoxAddress) => [a.name, a.line1, a.line2, `${a.city}${a.state ? `, ${a.state}` : ""} ${a.postalCode}`.trim(), a.country === "US" ? "United States" : "Canada"].filter(Boolean).join(", ");
