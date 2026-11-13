import { SHOP_CURRENCY } from "../moneySign";
// Tax centre › Ledger: the changes a line logged as a business expense allows (the old Tax Centre's category picker and
// delete). Sales and an item's own costs live elsewhere, so only `businessExpense` lines change here.
type Row = Record<string, any>;

const expensesOf = (tc: Row | null): Row[] => (Array.isArray(tc?.businessExpenses) ? tc!.businessExpenses : []);

/** A ledger line that this card may change. */
export const isEditableLine = (line: { sourceType?: string; itemId?: unknown }) => line.sourceType === "businessExpense" && line.itemId != null && line.itemId !== "";

/** The Tax centre with one business expense filed under another category; unchanged when it is gone or already there. */
export function changeCategory(tc: Row | null, id: unknown, cat: string): Row {
  const list = expensesOf(tc);
  const at = list.findIndex((e) => String(e.id) === String(id));
  if (at < 0 || list[at].cat === cat) return tc || {};
  const next = list.slice();
  next[at] = { ...list[at], cat };
  return { ...(tc || {}), businessExpenses: next };
}

/** The Tax centre without one business expense. A charge from a subscription stays posted as paid (it isn't posted again). */
export function removeExpense(tc: Row | null, id: unknown): Row {
  const list = expensesOf(tc);
  if (!list.some((e) => String(e.id) === String(id))) return tc || {};
  return { ...(tc || {}), businessExpenses: list.filter((e) => String(e.id) !== String(id)) };
}

/** The receipts a ledger line has (the newer list, else the single older address). */
export function receiptsOf(line: { receipt?: unknown; receiptFiles?: unknown }): string[] {
  const files = Array.isArray(line.receiptFiles) ? line.receiptFiles.filter((f): f is string => typeof f === "string" && !!f) : [];
  if (files.length) return files;
  return typeof line.receipt === "string" && line.receipt ? [line.receipt] : [];
}

/** The Tax centre with a receipt address added to one business expense (kept in both the list and the older field). */
export function attachReceipt(tc: Row | null, id: unknown, url: string): Row {
  const list = expensesOf(tc);
  const at = list.findIndex((e) => String(e.id) === String(id));
  if (at < 0 || !url) return tc || {};
  const e = list[at];
  const files = receiptsOf(e);
  if (files.includes(url)) return tc || {};
  const next = list.slice();
  next[at] = { ...e, receipt: e.receipt || url, receiptFiles: [...files, url] };
  return { ...(tc || {}), businessExpenses: next };
}

/** The receipts vault: lines that keep a receipt, and business expenses still waiting for one (not voided, not marked as needing none). */
export function receiptVault<T extends Row>(rows: T[]): { kept: T[]; missing: T[] } {
  const kept: T[] = [], missing: T[] = [];
  for (const r of rows) {
    if (receiptsOf(r).length) kept.push(r);
    else if (isEditableLine(r) && !r.receiptExempt && !r.voided) missing.push(r);
  }
  return { kept, missing };
}

/** The Tax centre with one receipt taken off a business expense (the older single field moves to the next one left). */
export function detachReceipt(tc: Row | null, id: unknown, url: string): Row {
  const list = expensesOf(tc);
  const at = list.findIndex((e) => String(e.id) === String(id));
  if (at < 0) return tc || {};
  const e = list[at];
  const files = receiptsOf(e);
  if (!files.includes(url)) return tc || {};
  const left = files.filter((f) => f !== url);
  const next = list.slice();
  next[at] = { ...e, receipt: e.receipt === url || !e.receipt ? left[0] || "" : e.receipt, receiptFiles: left };
  return { ...(tc || {}), businessExpenses: next };
}

/** The Tax centre with one business expense marked as needing no receipt, or as needing one again. Rent stays exempt either way. */
export function setNoReceiptNeeded(tc: Row | null, id: unknown, on: boolean): Row {
  const list = expensesOf(tc);
  const at = list.findIndex((e) => String(e.id) === String(id));
  if (at < 0 || !!list[at].receiptExempt === on) return tc || {};
  const next = list.slice();
  const { receiptExempt: _drop, ...rest } = list[at];
  next[at] = on ? { ...rest, receiptExempt: true } : rest;
  return { ...(tc || {}), businessExpenses: next };
}

/** Ids of business expenses the owner marked as needing no receipt (so the mark can be taken back; rent isn't one). */
export function markedNoReceipt(tc: Row | null): Set<string> {
  return new Set(expensesOf(tc).filter((e) => e?.receiptExempt === true && !e.isRent).map((e) => String(e.id)));
}

/** The edit form, filled from one business expense as the old Edit expense window did (its own amount and currency). */
export function expenseToForm(e: Row): { desc: string; cat: string; date: string; amount: string; currency: string; trip: string; ref: string } {
  return {
    desc: String(e.desc || ""), cat: String(e.cat || "Other"), date: String(e.date || ""),
    amount: e.amountUnknown ? "" : String(e.origAmount ?? e.amount ?? ""), currency: String(e.origCurrency || e.currency || SHOP_CURRENCY),
    trip: String(e.trip || ""), ref: String(e.ref || ""),
  };
}

/**
 * The Tax centre with one business expense changed (features/tax-entries.js saveExpenseEdit): words, category, date,
 * trip and amount, its value worked out again at the rate for its (new) date. `rate` is that rate, 0 when none could
 * be found: then the expense is marked as missing a value, filled in later. Unchanged when the expense is gone.
 */
export function editExpense(tc: Row | null, id: unknown, form: { desc: string; cat: string; date: string; currency: string; trip: string; ref: string }, amount: number, rate: number): Row {
  const list = expensesOf(tc);
  const at = list.findIndex((e) => String(e.id) === String(id));
  if (at < 0) return tc || {};
  const cents = (n: number) => Math.round(n * 100) / 100;
  const amt = cents(amount);
  const next = list.slice();
  const { amountUnknown: _unknown, ...rest } = list[at];
  next[at] = {
    ...rest, desc: form.desc.trim(), cat: form.cat, currency: form.currency, origCurrency: form.currency, amount: amt, origAmount: amt,
    fxRate: rate > 0 ? rate : null, baseAmount: rate > 0 ? cents(amt * rate) : null, fxMissing: !(rate > 0),
    date: form.date, trip: form.trip.trim(), ref: form.ref.trim(),
  };
  return { ...(tc || {}), businessExpenses: next };
}
