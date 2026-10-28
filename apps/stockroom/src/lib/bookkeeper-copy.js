// The bookkeeper's read-only tax centre (plan 7.17).
//
// The shop's Team can give someone the "bookkeeper" role: they read the money and change nothing. Here that means
// the Tax Centre's business expenses. settings/taxCenter itself also holds the AI keys (settings.geminiKey and the
// like), and rules can't hide one field of a document, so a bookkeeper never reads it. Instead, every time the
// publisher's device saves the Tax Centre, it also saves a copy with only the expense fields below
// (settings/taxCentreForBookkeeper, firebase.js _fbSaveSettings), and that copy is the one document the bookkeeper's
// rules open (firestore.rules isBookkeeper, database.rules.json). The bookkeeper's screen
// (features/bookkeeper-view.js) only reads it.
import { csvRow } from './csv.js';

export const BOOKKEEPER_COPY_KEY = 'taxCentreForBookkeeper';

/** True for a verified sign-in pass with the Team's bookkeeper role (the shop's functions/roles.js). */
export function isBookkeeperPass(user, claims) {
  return !!user && user.emailVerified === true && claims?.role === 'bookkeeper';
}

// The expense fields a bookkeeper needs. Receipts, email snippets and anything else stay out.
const EXPENSE_FIELDS = ['id', 'date', 'desc', 'vendor', 'cat', 'trip', 'currency', 'amount', 'baseAmount', 'amountUnknown', 'fxMissing'];

/** The bookkeeper's copy of a Tax Centre: its base currency and each business expense's listed fields. */
export function bookkeeperTaxCopy(taxCenter, at = new Date().toISOString()) {
  const expenses = Array.isArray(taxCenter?.businessExpenses) ? taxCenter.businessExpenses : [];
  return {
    baseCurrency: String(taxCenter?.settings?.baseCurrency || 'CAD'),
    at,
    businessExpenses: expenses
      .filter(e => e && typeof e === 'object' && typeof e.date === 'string')
      .map(e => Object.fromEntries(EXPENSE_FIELDS.filter(k => e[k] !== undefined && e[k] !== null).map(k => [k, e[k]]))),
  };
}

/** The same copy without its time stamp, to tell whether anything a bookkeeper sees has changed. */
export function bookkeeperCopyKey(copy) {
  return JSON.stringify({ ...copy, at: undefined });
}

/** An expense in the base currency: its converted amount, or its own amount when it was already in that currency. */
export function baseAmountOf(expense, baseCurrency = 'CAD') {
  if (expense?.amountUnknown) return 0;
  if (typeof expense?.baseAmount === 'number') return expense.baseAmount;
  return (expense?.currency || baseCurrency) === baseCurrency && typeof expense?.amount === 'number' ? expense.amount : 0;
}

/** The years with expenses, newest first. */
export function copyYears(copy) {
  return [...new Set((copy?.businessExpenses || []).map(e => e.date.slice(0, 4)).filter(y => /^\d{4}$/.test(y)))].sort().reverse();
}

/** One year's expenses, newest first, with the total per category and overall (in the base currency, cents). */
export function yearSummary(copy, year) {
  const base = copy?.baseCurrency || 'CAD';
  const rows = (copy?.businessExpenses || []).filter(e => e.date.startsWith(String(year)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const byCategory = new Map();
  let totalCents = 0;
  let unconverted = 0;
  for (const e of rows) {
    const cents = Math.round(baseAmountOf(e, base) * 100);
    if (!cents && !e.amountUnknown && (e.currency || base) !== base) unconverted++;
    totalCents += cents;
    const cat = e.cat || 'Other';
    byCategory.set(cat, (byCategory.get(cat) || 0) + cents);
  }
  const categories = [...byCategory].map(([cat, cents]) => ({ cat, total: cents / 100 })).sort((a, b) => b.total - a.total);
  return { rows, categories, total: totalCents / 100, unconverted, baseCurrency: base };
}

/** The year's expenses as a spreadsheet (one line each, in the base currency and as charged). */
export function yearCsv(copy, year) {
  const { rows, baseCurrency } = yearSummary(copy, year);
  const lines = [csvRow(['Date', 'Description', 'Vendor', 'Category', 'Trip', `Amount (${baseCurrency})`, 'Amount as charged', 'Currency as charged'])];
  for (const e of rows) {
    lines.push(csvRow([e.date, e.desc || '', e.vendor || '', e.cat || '', e.trip || '',
      e.amountUnknown ? '' : baseAmountOf(e, baseCurrency).toFixed(2),
      e.amountUnknown || typeof e.amount !== 'number' ? '' : e.amount.toFixed(2), e.currency || baseCurrency]));
  }
  return lines.join('\n');
}
