// Tax centre › Recurring subscriptions: hosting, software, rent and other costs that repeat. The schedule rules are the
// stockroom's own (`@stockroom/recurring.js`: cadence, end date, pause, price changes). Pure rules here; the saves are in
// RecurringSubscriptions.tsx through `updateSetting("taxCenter")` (WRITING.md).
import { localYmd, newRecurringId, normalizeRecurring, recurringDueCharges, RECURRING_FREQUENCIES } from "@stockroom/recurring.js";
import { baseCurrencyOf, EXPENSE_CATEGORIES, savedRate } from "./taxExpense";

type Row = Record<string, any>;
export { RECURRING_FREQUENCIES };
export type SubForm = { desc: string; vendor: string; cat: string; currency: string; amount: string; frequency: string; startDate: string; endDate: string; notes: string };
export type SubErrors = Partial<Record<keyof SubForm, string>>;

export const blankSub = (base: string, today: string): SubForm => ({ desc: "", vendor: "", cat: "Software & Subscriptions", currency: base, amount: "", frequency: "monthly", startDate: today, endDate: "", notes: "" });
export const recurringList = (tc: Row | null): Row[] => (Array.isArray(tc?.recurring) ? tc!.recurring : []);

export function subToForm(sub: Row): SubForm {
  const s = normalizeRecurring(sub);
  return { desc: s.desc, vendor: s.vendor, cat: EXPENSE_CATEGORIES.includes(s.cat) ? s.cat : "Other", currency: s.currency, amount: s.amount ? String(s.amount) : "", frequency: s.frequency, startDate: s.startDate, endDate: s.endDate, notes: s.notes };
}

export function checkSub(form: SubForm): { ok: true } | { ok: false; errors: SubErrors } {
  const errors: SubErrors = {};
  if (!form.desc.trim()) errors.desc = "Say what it is, like Hosting or Rent.";
  if (!(Number(form.amount) > 0)) errors.amount = "Enter the amount of one charge.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.startDate)) errors.startDate = "Pick the date of the first charge.";
  if (form.endDate && form.endDate < form.startDate) errors.endDate = "The end date can't be before the first charge.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

/** One ledger line for a due charge: the same fields the old stockroom writes for an auto-posted charge. */
function chargeLine(tc: Row, sub: Row, charge: { date: string; monthKey: string; amount: number }, today: string, id: number): Row {
  const base = baseCurrencyOf(tc);
  const cur = sub.currency || base;
  let rate = savedRate(tc, cur, base);
  // A past charge has no rate of its own day here, so it is flagged for the stockroom to fill in, not booked at today's.
  if (rate && cur !== base && charge.date < today) rate = null;
  const cents = (n: number) => Math.round(n * 100) / 100;
  return {
    id, desc: `${sub.desc} (Recurring)`, cat: sub.cat, currency: cur, amount: charge.amount, fxRate: rate, baseAmount: rate ? cents(charge.amount * rate) : null,
    ...(rate ? {} : { fxMissing: true }), date: charge.date, ref: "Auto-Injected", recurringId: sub.id || "", recurringPeriod: charge.monthKey, receipt: "",
  };
}

/** Post every charge that has come due and isn't in the ledger yet. Safe to run twice: `lastInjected` marks what is posted. */
export function postDueCharges(tc: Row | null, now: Date = new Date()): { taxCenter: Row; posted: number } {
  const base: Row = tc && typeof tc === "object" ? tc : {};
  const today = localYmd(now);
  let seq = now.getTime();
  const lines: Row[] = [];
  const subs = recurringList(base).map((sub) => {
    const withId = sub.id ? sub : { ...sub, id: newRecurringId() };
    let lastInjected = withId.lastInjected || "";
    for (const charge of recurringDueCharges(withId, now)) {
      lines.push(chargeLine(base, withId, charge, today, ++seq));
      if (charge.monthKey > lastInjected) lastInjected = charge.monthKey;
    }
    return lastInjected === (withId.lastInjected || "") && withId === sub ? sub : { ...withId, lastInjected };
  });
  if (!lines.length && subs.every((s, i) => s === recurringList(base)[i])) return { taxCenter: base, posted: 0 };
  return { taxCenter: { ...base, recurring: subs, businessExpenses: [...lines.reverse(), ...(Array.isArray(base.businessExpenses) ? base.businessExpenses : [])] }, posted: lines.length };
}

/** Add a subscription, or change the one with `id` (its price changes and posted-month marker are kept). */
export function saveSub(tc: Row | null, form: SubForm, id: string | null): Row {
  const base: Row = tc && typeof tc === "object" ? tc : {};
  const list = recurringList(base);
  const fields = { desc: form.desc.trim(), vendor: form.vendor.trim(), cat: form.cat, currency: form.currency, amount: Number(form.amount), frequency: form.frequency, startDate: form.startDate, endDate: form.endDate, notes: form.notes.trim() };
  const at = id ? list.findIndex((s) => String(s.id) === String(id)) : -1;
  if (at >= 0) return { ...base, recurring: list.map((s, i) => (i === at ? { ...s, ...fields } : s)) };
  return { ...base, recurring: [...list, { ...fields, id: newRecurringId(), paused: false, lastInjected: "" }] };
}

/** Pause or resume. Resuming moves the posted-month marker to last month so the paused gap is not billed back. */
export function togglePause(tc: Row | null, id: string, now: Date = new Date()): Row {
  const base: Row = tc && typeof tc === "object" ? tc : {};
  return {
    ...base,
    recurring: recurringList(base).map((s) => {
      if (String(s.id) !== String(id)) return s;
      if (!s.paused) return { ...s, paused: true };
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const key = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      return { ...s, paused: false, lastInjected: (s.lastInjected || "") < key ? key : s.lastInjected };
    }),
  };
}

/** Remove a subscription. Charges already posted stay in the ledger. */
export const removeSub = (tc: Row | null, id: string): Row => ({ ...(tc || {}), recurring: recurringList(tc).filter((s) => String(s.id) !== String(id)) });

export function isDuplicateSub(tc: Row | null, form: SubForm, ignoreId: string | null): Row | null {
  return recurringList(tc).find((s) => !s.paused && String(s.id) !== String(ignoreId) && String(s.desc || "").trim().toLowerCase() === form.desc.trim().toLowerCase()) || null;
}
