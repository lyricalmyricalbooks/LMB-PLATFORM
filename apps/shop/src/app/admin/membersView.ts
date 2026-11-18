// Admin › Members (beta): the words and small sums the page shows. Pure, so membersView.test.ts covers them.
import { MAX_PLAN_MINOR, MIN_PLAN_MINOR, MAX_TRIAL_DAYS, type MemberState, type PlanInterval } from "../../shared/membershipRules";
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

/** The plan form's text fields. */
export type PlanForm = { name: string; description: string; perks: string; interval: PlanInterval; price: string; trial: string; hidden: boolean };
export const blankPlanForm = (): PlanForm => ({ name: "", description: "", perks: "", interval: "month", price: "", trial: "", hidden: false });
export function planFormOf(p: { name: string; description: string; perks: string[]; interval: PlanInterval; priceMinor: number; trialDays: number; hidden: boolean }): PlanForm {
  return { name: p.name, description: p.description, perks: p.perks.join("\n"), interval: p.interval, price: (p.priceMinor / 100).toFixed(2), trial: p.trialDays ? String(p.trialDays) : "", hidden: p.hidden };
}
/** The form as the server takes it, or the first problem and its field. */
export function planFromForm(form: PlanForm, money: (minor: number) => string): { plan: PlanInput } | { problem: string; field: "name" | "price" | "trial" } {
  if (!form.name.trim()) return { problem: "Give the plan a name.", field: "name" };
  const price = planPriceFromText(form.price, money);
  if ("problem" in price) return { problem: price.problem, field: "price" };
  const trial = trialFromText(form.trial);
  if ("problem" in trial) return { problem: trial.problem, field: "trial" };
  const perks = form.perks.split("\n").map((l) => l.trim()).filter(Boolean);
  return { plan: { name: form.name.trim(), description: form.description.trim(), perks, interval: form.interval, priceMinor: price.minor, trialDays: trial.days, hidden: form.hidden } };
}
