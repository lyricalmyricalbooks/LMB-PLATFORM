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
