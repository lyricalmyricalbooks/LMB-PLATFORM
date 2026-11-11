// Tax centre › Pending & to confirm: costs the press knows are coming but cannot log yet (no amount, no receipt, no final
// date). They stay out of the ledger totals until confirmed. Same fields as the old stockroom's notes. Pure rules; the
// saves are in PendingExpenses.tsx through `updateSetting("taxCenter")` (WRITING.md).
import { EXPENSE_CATEGORIES, type ExpenseForm } from "./taxExpense";

type Row = Record<string, any>;
export type PendingForm = { desc: string; cat: string; currency: string; estAmount: string; expectedDate: string; remindOn: string; trip: string; note: string };
export type PendingErrors = Partial<Record<keyof PendingForm, string>>;
export type Due = { state: "overdue" | "today" | "soon" | "later" | "none"; days: number | null; label: string };

export const blankPending = (base: string): PendingForm => ({ desc: "", cat: "Other", currency: base, estAmount: "", expectedDate: "", remindOn: "", trip: "", note: "" });
export const pendingList = (tc: Row | null): Row[] => (Array.isArray(tc?.pendingExpenses) ? tc!.pendingExpenses : []);

export function daysUntil(iso: string | undefined, today: string): number | null {
  if (!iso) return null;
  const a = Date.parse(`${today}T00:00:00`), b = Date.parse(`${iso}T00:00:00`);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 86400000);
}

export function pendingDue(item: Row, today: string): Due {
  const days = daysUntil(item?.remindOn, today);
  if (days === null) return { state: "none", days: null, label: "No reminder" };
  if (days < 0) return { state: "overdue", days, label: `${-days} day${days === -1 ? "" : "s"} overdue` };
  if (days === 0) return { state: "today", days, label: "Due today" };
  if (days <= 7) return { state: "soon", days, label: `In ${days} day${days === 1 ? "" : "s"}` };
  return { state: "later", days, label: `In ${days} days` };
}

const ORDER = { overdue: 0, today: 1, soon: 2, later: 3, none: 4 } as const;
/** Most urgent first; notes with no reminder sink to the bottom. */
export function sortedPending(tc: Row | null, today: string): Array<{ item: Row; due: Due }> {
  return pendingList(tc).map((item) => ({ item, due: pendingDue(item, today) })).sort((a, b) => {
    const rank = ORDER[a.due.state] - ORDER[b.due.state];
    if (rank) return rank;
    if (a.due.days !== null && b.due.days !== null && a.due.days !== b.due.days) return a.due.days - b.due.days;
    return String(a.item.expectedDate || "").localeCompare(String(b.item.expectedDate || ""));
  });
}

export function checkPending(form: PendingForm): { ok: true } | { ok: false; errors: PendingErrors } {
  const errors: PendingErrors = {};
  if (!form.desc.trim()) errors.desc = "Give the note a description, so you can recognise it later.";
  if (form.estAmount.trim() && !(Number(form.estAmount) >= 0)) errors.estAmount = "The estimate must be a number, or blank.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

const withList = (tc: Row | null, list: Row[]): Row => ({ ...(tc && typeof tc === "object" ? tc : {}), pendingExpenses: list });

/** Add a note (first), or replace the one with this id. */
export function savePending(tc: Row | null, form: PendingForm, id: number, today: string): Row {
  const list = pendingList(tc);
  const at = list.findIndex((p) => String(p.id) === String(id));
  const record = {
    id, desc: form.desc.trim(), cat: form.cat || "Other", currency: form.currency, estAmount: Number(form.estAmount) > 0 ? Number(form.estAmount) : 0,
    expectedDate: form.expectedDate.trim(), remindOn: form.remindOn.trim(), trip: form.trip.trim(), note: form.note.trim(),
    created: (at >= 0 && list[at].created) || today,
  };
  return withList(tc, at >= 0 ? list.map((p, i) => (i === at ? record : p)) : [record, ...list]);
}

export const deletePending = (tc: Row | null, id: string | number): Row => withList(tc, pendingList(tc).filter((p) => String(p.id) !== String(id)));

/** Push a reminder out by `days` from today. */
export function snoozePending(tc: Row | null, id: string | number, days: number, today: string): Row {
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() + days);
  const on = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return withList(tc, pendingList(tc).map((p) => (String(p.id) === String(id) ? { ...p, remindOn: on } : p)));
}

export function pendingToForm(item: Row): PendingForm {
  return { desc: item.desc || "", cat: item.cat || "Other", currency: item.currency || "CAD", estAmount: item.estAmount ? String(item.estAmount) : "", expectedDate: item.expectedDate || "", remindOn: item.remindOn || "", trip: item.trip || "", note: item.note || "" };
}

/** What the expense form starts with when a note is confirmed. */
export function confirmPrefill(item: Row, today: string): ExpenseForm {
  const cat = EXPENSE_CATEGORIES.includes(item.cat) ? item.cat : "Other";
  return { desc: item.desc || "", cat, date: item.expectedDate || today, amount: item.estAmount ? String(item.estAmount) : "", currency: item.currency || "CAD", trip: item.trip || "", ref: "" };
}
