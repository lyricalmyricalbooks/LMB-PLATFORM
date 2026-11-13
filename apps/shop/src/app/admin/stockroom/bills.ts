// Bookkeeping › Bills to pay: bills from printers and suppliers that came in and aren't paid yet. Each has a supplier,
// an amount, a due day and (often) the bill itself as a file. Paying one logs it as a business expense in the same save
// (taxExpense.ts `addBusinessExpense`, with the bill's file as the receipt), so the ledger and the Tax centre count it
// from the day it was paid, never before.
//
// Bills live in the Tax centre's `bills` list. The Tax centre is saved through `updateSetting("taxCenter")`, which merges
// key by key and its id-keyed lists row by row (`@stockroom/merge-state.js` mergeSettingDoc), so a bill added on the
// phone and an expense logged on the laptop both survive. Pure; the page is BillsPage.tsx.
//
// How this sits beside Pending & to confirm (taxPending.ts): a pending note is a cost you expect but can't price yet
// (no bill, no amount). A bill is the real thing: it came in with an amount and a day to pay by. When the bill for a
// pending note arrives, "From a cost you noted" fills the bill from the note and clears the note in the same save, so
// the two never count the same cost twice.
import { fmt, fmtD } from "@stockroom/money.js";

import { addBusinessExpense, baseCurrencyOf, EXPENSE_CATEGORIES, type ExpenseForm } from "./taxExpense";
import { attachReceipt } from "./taxLedger";
import { daysUntil } from "./taxPending";
import { addMoney, type Owed } from "./stockists";
import { SHOP_CURRENCY } from "../moneySign";

type Row = Record<string, any>;
const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const cents = (n: number) => Math.round(n * 100) / 100;

/** How many days before the due day a bill shows as "due soon" and the owner is told. */
export const REMIND_DAYS = 3;

export type Bill = {
  id: string; supplier: string; desc: string; cat: string; amount: number; currency: string; billDate: string; dueDate: string;
  ref: string; file: string; status: "open" | "paid"; paidDate: string; paidAt: number | null; expenseId: number | null; note: string; createdAt: number;
};
export type BillForm = { supplier: string; desc: string; cat: string; amount: string; currency: string; billDate: string; dueDate: string; ref: string; note: string };
export type BillErrors = Partial<Record<keyof BillForm, string>>;
export type BillDue = { state: "overdue" | "today" | "soon" | "later" | "none" | "paid"; days: number | null; label: string };

export const billList = (tc: Row | null): Bill[] => (Array.isArray(tc?.bills) ? (tc!.bills as Row[]) : []).filter((b) => b && b.id != null).map(cleanBill);

function cleanBill(b: Row): Bill {
  return {
    id: String(b.id), supplier: text(b.supplier), desc: text(b.desc), cat: EXPENSE_CATEGORIES.includes(b.cat) ? b.cat : "Other",
    amount: Number(b.amount) || 0, currency: text(b.currency) || SHOP_CURRENCY, billDate: text(b.billDate), dueDate: text(b.dueDate), ref: text(b.ref),
    file: text(b.file), status: b.status === "paid" ? "paid" : "open", paidDate: text(b.paidDate), paidAt: Number(b.paidAt) || null,
    expenseId: Number.isFinite(Number(b.expenseId)) && b.expenseId != null ? Number(b.expenseId) : null, note: text(b.note), createdAt: Number(b.createdAt) || 0,
  };
}

export const blankBill = (base: string, today: string): BillForm => ({ supplier: "", desc: "", cat: "Printing & Production", amount: "", currency: base, billDate: today, dueDate: "", ref: "", note: "" });
export const billToForm = (b: Bill): BillForm => ({ supplier: b.supplier, desc: b.desc, cat: b.cat, amount: b.amount ? String(b.amount) : "", currency: b.currency, billDate: b.billDate, dueDate: b.dueDate, ref: b.ref, note: b.note });

/** A pending note's details as a bill (the note's estimate as the amount, its expected day as the due day). */
export function billFromNote(note: Row, base: string, today: string): BillForm {
  return { ...blankBill(note.currency || base, today), desc: text(note.desc), cat: EXPENSE_CATEGORIES.includes(note.cat) ? note.cat : "Other",
    amount: Number(note.estAmount) > 0 ? String(note.estAmount) : "", dueDate: text(note.expectedDate), note: text(note.note) };
}

export function checkBill(form: BillForm): { ok: true; amount: number } | { ok: false; errors: BillErrors } {
  const errors: BillErrors = {};
  if (!form.supplier.trim()) errors.supplier = "Who is the bill from?";
  const amount = Number(form.amount);
  if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0) errors.amount = "Enter the amount, more than zero.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) errors.dueDate = "Pick the day it has to be paid by.";
  if (form.billDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.billDate)) errors.billDate = "Pick the day on the bill, or leave it blank.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, amount };
}

const withBills = (tc: Row | null, list: Row[]): Row => ({ ...(tc && typeof tc === "object" ? tc : {}), bills: list });
const rawBills = (tc: Row | null): Row[] => (Array.isArray(tc?.bills) ? tc!.bills : []);

/**
 * Add a bill (first in the list), or change the open one with this id. `file` replaces the stored file only when given.
 * `fromNote` clears that pending note in the same save. A paid bill can't be changed: its expense is in the books.
 */
export function saveBill(tc: Row | null, form: BillForm, amount: number, id: string, opts: { now: number; file?: string; fromNote?: string | number }): Row {
  const list = rawBills(tc);
  const at = list.findIndex((b) => String(b?.id) === id);
  if (at >= 0 && list[at].status === "paid") throw new Error("This bill is paid, so it's in your books now. Change the expense instead.");
  const old = at >= 0 ? list[at] : null;
  const record = {
    id, supplier: form.supplier.trim(), desc: form.desc.trim(), cat: EXPENSE_CATEGORIES.includes(form.cat) ? form.cat : "Other",
    amount: cents(amount), currency: form.currency || SHOP_CURRENCY, billDate: form.billDate.trim(), dueDate: form.dueDate.trim(), ref: form.ref.trim(),
    note: form.note.trim(), file: opts.file ?? old?.file ?? "", status: "open", createdAt: old?.createdAt || opts.now, updatedAt: opts.now,
  };
  const next = old ? list.map((b, i) => (i === at ? record : b)) : [record, ...list];
  const out = withBills(tc, next);
  if (opts.fromNote != null) out.pendingExpenses = (Array.isArray(out.pendingExpenses) ? out.pendingExpenses : []).filter((p: Row) => String(p.id) !== String(opts.fromNote));
  return out;
}

/** Delete an open bill (entered by mistake). A paid one stays: its expense is in the books. */
export function deleteBill(tc: Row | null, id: string): Row {
  const list = rawBills(tc);
  const b = list.find((x) => String(x?.id) === id);
  if (!b) throw new Error("This bill is no longer in your records. Reload the page.");
  if (b.status === "paid") throw new Error("A paid bill stays on file, so it can't be deleted.");
  return withBills(tc, list.filter((x) => x !== b));
}

/** The expense a paid bill becomes: "Supplier — what it was for", on the day it was paid, the bill's number as reference. */
export function billExpenseForm(b: Bill, paidDate: string): ExpenseForm {
  return { desc: [b.supplier, b.desc].filter(Boolean).join(" — "), cat: b.cat, date: paidDate, amount: String(b.amount), currency: b.currency, trip: "", ref: b.ref };
}

/**
 * Paid: log the business expense (same row as Log expense, with the supplier as vendor and the bill's file as the
 * receipt) and mark the bill paid with the expense's id, in one save. `expenseId` is fixed before the first try, so a
 * retry or a second device never logs it twice. `rates` as for Log expense (the rate on the day it was paid).
 */
export function payBill(tc: Row | null, id: string, ctx: { paidDate: string; expenseId: number; now: Date; rates?: Record<string, number> }): Row {
  const list = rawBills(tc);
  const at = list.findIndex((x) => String(x?.id) === id);
  if (at < 0) throw new Error("This bill is no longer in your records. Reload the page.");
  const raw = list[at];
  if (raw.status === "paid") {
    if (Number(raw.expenseId) === ctx.expenseId) return tc || {};
    throw new Error("This bill is already marked paid.");
  }
  const b = cleanBill(raw);
  let out = addBusinessExpense(tc, billExpenseForm(b, ctx.paidDate), b.amount, ctx.expenseId, ctx.now, undefined, ctx.rates);
  out = { ...out, businessExpenses: (out.businessExpenses as Row[]).map((e) => (e.id === ctx.expenseId ? { ...e, vendor: b.supplier, fromBill: b.id } : e)) };
  if (b.file) out = attachReceipt(out, ctx.expenseId, b.file);
  const bills = rawBills(out).map((x) => (String(x?.id) === id ? { ...x, status: "paid", paidDate: ctx.paidDate, paidAt: ctx.now.getTime(), expenseId: ctx.expenseId, updatedAt: ctx.now.getTime() } : x));
  return withBills(out, bills);
}

export function billDue(b: Bill, today: string): BillDue {
  if (b.status === "paid") return { state: "paid", days: null, label: b.paidDate ? `Paid ${fmtD(b.paidDate)}` : "Paid" };
  const days = daysUntil(b.dueDate, today);
  if (days === null) return { state: "none", days: null, label: "No due day" };
  if (days < 0) return { state: "overdue", days, label: `${-days} day${days === -1 ? "" : "s"} late` };
  if (days === 0) return { state: "today", days, label: "Due today" };
  if (days <= REMIND_DAYS) return { state: "soon", days, label: `Due in ${days} day${days === 1 ? "" : "s"}` };
  return { state: "later", days, label: `Due ${fmtD(b.dueDate)}` };
}

export type BillFilter = "open" | "soon" | "overdue" | "paid" | "all";
export const BILL_FILTERS: Array<{ id: BillFilter; label: string }> = [
  { id: "open", label: "To pay" }, { id: "soon", label: "Due soon" }, { id: "overdue", label: "Late" }, { id: "paid", label: "Paid" }, { id: "all", label: "All" },
];
export function inBillFilter(b: Bill, due: BillDue, f: BillFilter): boolean {
  if (f === "all") return true;
  if (f === "paid") return b.status === "paid";
  if (b.status === "paid") return false;
  if (f === "overdue") return due.state === "overdue";
  if (f === "soon") return due.state === "today" || due.state === "soon";
  return true;
}

const RANK = { overdue: 0, today: 1, soon: 2, later: 3, none: 4, paid: 5 } as const;
/** Most urgent first; paid ones last, newest paid first. */
export function sortedBills(tc: Row | null, today: string): Array<{ bill: Bill; due: BillDue }> {
  return billList(tc).map((bill) => ({ bill, due: billDue(bill, today) })).sort((a, b) => {
    const r = RANK[a.due.state] - RANK[b.due.state];
    if (r) return r;
    if (a.due.state === "paid") return (b.bill.paidAt || 0) - (a.bill.paidAt || 0);
    return a.bill.dueDate.localeCompare(b.bill.dueDate);
  });
}

export type BillsSummary = { open: Owed[]; openCount: number; soon: Owed[]; soonCount: number; late: Owed[]; lateCount: number; paid30: Owed[]; counts: Record<BillFilter, number> };
export function billsSummary(rows: Array<{ bill: Bill; due: BillDue }>, now: number = Date.now()): BillsSummary {
  const out: BillsSummary = { open: [], openCount: 0, soon: [], soonCount: 0, late: [], lateCount: 0, paid30: [], counts: { open: 0, soon: 0, overdue: 0, paid: 0, all: 0 } };
  const since = now - 30 * 86_400_000;
  for (const { bill: b, due } of rows) {
    for (const f of BILL_FILTERS) if (inBillFilter(b, due, f.id)) out.counts[f.id] += 1;
    if (b.status === "paid") { if ((b.paidAt || 0) >= since) addMoney(out.paid30, b.currency, b.amount); continue; }
    addMoney(out.open, b.currency, b.amount); out.openCount++;
    if (due.state === "overdue") { addMoney(out.late, b.currency, b.amount); out.lateCount++; }
    if (due.state === "today" || due.state === "soon") { addMoney(out.soon, b.currency, b.amount); out.soonCount++; }
  }
  return out;
}

/**
 * The reminder the admin shows before a bill is due (and once it's late): one alert for every bill due in the next
 * REMIND_DAYS days or past due. Null when none. `key` changes with the list, so a hidden alert comes back for a new bill.
 */
export function billsAlert(tc: Row | null, today: string): { id: string; title: string; detail: string; key: string; late: number } | null {
  const rows = sortedBills(tc, today).filter((r) => r.due.state === "overdue" || r.due.state === "today" || r.due.state === "soon");
  if (!rows.length) return null;
  const late = rows.filter((r) => r.due.state === "overdue").length;
  const title = late
    ? `${late === 1 ? "A bill is" : `${late} bills are`} past due${rows.length > late ? `, ${rows.length - late} more due soon` : ""}`
    : `${rows.length === 1 ? "A bill is" : `${rows.length} bills are`} due in the next ${REMIND_DAYS} days`;
  const detail = rows.slice(0, 4).map((r) => `${r.bill.supplier}: ${fmt(r.bill.amount, r.bill.currency)}, ${r.due.label.toLowerCase()}.`).join(" ")
    + (rows.length > 4 ? ` And ${rows.length - 4} more.` : "");
  return { id: "bills-due", title, detail, key: `${today}-${rows.map((r) => r.bill.id).join(",")}`, late };
}

/** The suppliers already used, most used first, for the supplier box's suggestions. */
export function supplierChoices(tc: Row | null): string[] {
  const n = new Map<string, number>();
  for (const b of billList(tc)) if (b.supplier) n.set(b.supplier, (n.get(b.supplier) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

export { baseCurrencyOf };
