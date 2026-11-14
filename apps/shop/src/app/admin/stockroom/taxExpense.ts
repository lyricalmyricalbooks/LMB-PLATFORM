import { homeCurrency } from "../moneySign";
// Tax centre › Log a business expense. The pure rules: what a form must hold, and the row the old stockroom writes for it
// (same fields as its own "log an expense", so each app reads the other's rows). The save itself is in LogExpense.tsx and
// goes through `stockroomWriteApi.updateSetting("taxCenter", …)` (WRITING.md).

export const EXPENSE_CATEGORIES = [
  "Software & Subscriptions", "Marketing & Advertising", "Printing & Production", "Editorial & Proofreading",
  "Illustration & Photography", "Rights & Permissions", "ISBN, Barcodes & Cataloging", "Shipping & Postage",
  "Warehousing & Fulfillment", "Packaging Materials", "Office Supplies", "Home Office", "Travel", "Meals & Entertainment",
  "Professional Services", "Sales Processing Fees", "Books, Research & Reference", "Events & Exhibitions", "Other",
];

export const EXPENSE_CURRENCIES = ["CAD", "USD", "EUR", "GBP", "AUD", "NZD", "CHF", "JPY", "SEK", "NOK", "DKK", "MXN"];

export type ExpenseForm = { desc: string; cat: string; date: string; amount: string; currency: string; trip: string; ref: string };
export type ExpenseErrors = Partial<Record<keyof ExpenseForm, string>>;
type Row = Record<string, any>;

export const blankExpense = (base: string, today: string): ExpenseForm => ({ desc: "", cat: EXPENSE_CATEGORIES[0], date: today, amount: "", currency: base, trip: "", ref: "" });

export function checkExpense(form: ExpenseForm): { ok: true; amount: number } | { ok: false; errors: ExpenseErrors } {
  const errors: ExpenseErrors = {};
  if (!form.desc.trim()) errors.desc = "Say what it was for.";
  if (!EXPENSE_CATEGORIES.includes(form.cat)) errors.cat = "Pick a category.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errors.date = "Pick the date it was paid.";
  const amount = Number(form.amount);
  if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0) errors.amount = "Enter the amount, more than zero.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, amount };
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** The saved exchange rate for `code` into the base currency, or null when the Tax centre has none yet. */
export function savedRate(taxCenter: Row | null, code: string, base: string): number | null {
  if (code === base) return 1;
  const rates = taxCenter?.settings?.rates;
  const r = rates && typeof rates === "object" ? Number((rates as Row)[`${code}_${base}`]) : NaN;
  return Number.isFinite(r) && r > 0 ? r : null;
}

export function baseCurrencyOf(taxCenter: Row | null): string {
  return homeCurrency(taxCenter?.settings?.baseCurrency);
}

/** Same day, same words, same amount as one already logged. */
export function isDuplicate(taxCenter: Row | null, form: ExpenseForm, amount: number): boolean {
  const rows: Row[] = Array.isArray(taxCenter?.businessExpenses) ? taxCenter!.businessExpenses : [];
  const want = form.desc.trim().toLowerCase();
  return rows.some((e) => e.date === form.date && String(e.desc || "").trim().toLowerCase() === want && Math.abs(Number(e.origAmount ?? e.amount) - amount) < 0.005);
}

/** The Tax centre with the new expense first in its list (and, when `confirmedNote` is given, that pending note cleared). `id` keeps a second tap or a retry from adding it twice. */
/**
 * `rates` holds the rate for the expense's own date when the page looked it up first (taxRates.ts expenseRatesFor:
 * `CUR@YYYY-MM-DD`, 0 when none could be found, so the expense is saved as missing a value and filled in later).
 * Without one, the Tax centre's saved daily rate is used.
 */
export function addBusinessExpense(taxCenter: Row | null, form: ExpenseForm, amount: number, id: number, now: Date = new Date(), confirmedNote?: string | number, rates?: Record<string, number>): Row {
  const tc: Row = taxCenter && typeof taxCenter === "object" ? taxCenter : {};
  const base = baseCurrencyOf(tc);
  const list: Row[] = Array.isArray(tc.businessExpenses) ? tc.businessExpenses : [];
  if (list.some((e) => e.id === id)) return tc;
  const looked = form.currency === base ? undefined : rates?.[`${form.currency}@${form.date}`];
  const rate = looked === undefined ? savedRate(tc, form.currency, base) : looked > 0 ? looked : null;
  const row: Row = {
    id, desc: form.desc.trim(), vendor: "", cat: form.cat, currency: form.currency, amount: cents(amount),
    origCurrency: form.currency, origAmount: cents(amount), fxRate: rate, baseAmount: rate ? cents(amount * rate) : null,
    ...(rate ? {} : { fxMissing: true }), date: form.date, ref: form.ref.trim(), receipt: "",
    ...(form.trip.trim() ? { trip: form.trip.trim() } : {}), loggedAt: now.toISOString(),
  };
  // Confirming a pending note logs the expense and clears the note in the same save.
  const pending = confirmedNote == null ? tc.pendingExpenses : (Array.isArray(tc.pendingExpenses) ? tc.pendingExpenses : []).filter((p: Row) => String(p.id) !== String(confirmedNote));
  return { ...tc, businessExpenses: [row, ...list], ...(pending !== undefined ? { pendingExpenses: pending } : {}) };
}

/** Trip names already used, newest first, with how many expenses each holds (the old page's quick chips). */
export function tripChoices(taxCenter: Row | null): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  const rows: Row[] = Array.isArray(taxCenter?.businessExpenses) ? taxCenter!.businessExpenses : [];
  for (const e of rows) if (e.trip) counts.set(e.trip, (counts.get(e.trip) || 0) + 1);
  for (const t of Array.isArray(taxCenter?.trips) ? taxCenter!.trips : []) if (t?.name && !counts.has(t.name)) counts.set(t.name, 0);
  return [...counts].map(([name, count]) => ({ name, count }));
}
