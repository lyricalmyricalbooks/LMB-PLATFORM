// Tax centre › Log several at once: one expense per line ("2026-11-03, Canva, 16.99"), typed or pasted from a spreadsheet.
// The date is optional (today), the amount is the last thing on the line. Each line becomes the same row the one-at-a-time
// form writes (addBusinessExpense), so the ledger and the old stockroom read them the same way.
import { categoryFromRules } from "./taxRules";
import { addBusinessExpense, checkExpense, EXPENSE_CATEGORIES, isDuplicate, type ExpenseForm } from "./taxExpense";

type Row = Record<string, any>;
export const MAX_LINES = 200;

export type ExpenseLine = { line: number; text: string; form: ExpenseForm; amount: number; problem?: string; duplicate?: boolean; ruled?: boolean };

const DATE_AT_START = /^\s*(\d{4}-\d{2}-\d{2})\s*(?:[,\t;]|\s)\s*/;
const AMOUNT_AT_END = /(?:[,\t;]|\s)\s*(?:[A-Z]{3}\s*)?[$€£]?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*$/;

/** Reads the lines; blank lines are skipped. Every line comes back, with a plain problem when it can't be logged. */
export function readExpenseLines(text: string, opts: { taxCenter: Row | null; base: string; today: string; cat: string }): ExpenseLine[] {
  const out: ExpenseLine[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    let rest = raw;
    let date = opts.today;
    const d = rest.match(DATE_AT_START);
    if (d) { date = d[1]; rest = rest.slice(d[0].length); }
    const a = rest.match(AMOUNT_AT_END);
    const amountText = a ? a[1].replace(/,/g, "") : "";
    const desc = (a ? rest.slice(0, a.index) : rest).replace(/^[\s,;\t]+|[\s,;\t]+$/g, "").replace(/^"(.*)"$/, "$1");
    const ruledCat = categoryFromRules(opts.taxCenter, desc, EXPENSE_CATEGORIES);
    const form: ExpenseForm = { desc, cat: ruledCat || opts.cat, date, amount: amountText, currency: opts.base, trip: "", ref: "" };
    const checked = checkExpense(form);
    const item: ExpenseLine = { line: i + 1, text: raw.trim(), form, amount: checked.ok ? checked.amount : 0, ruled: !!ruledCat };
    if (!a) item.problem = "No amount at the end of the line.";
    else if (!checked.ok) item.problem = Object.values(checked.errors)[0];
    else {
      const key = `${date}|${desc.toLowerCase()}|${checked.amount.toFixed(2)}`;
      if (seen.has(key) || isDuplicate(opts.taxCenter, form, checked.amount)) item.duplicate = true;
      seen.add(key);
    }
    out.push(item);
  });
  return out;
}

/** The lines that will be logged: no problem, not already in the ledger. */
export const loggable = (lines: ExpenseLine[]) => lines.filter((l) => !l.problem && !l.duplicate);

/** The Tax centre with every loggable line added in one save. `firstId` + position keeps a retry from adding any twice. */
export function addExpenseLines(taxCenter: Row | null, lines: ExpenseLine[], firstId: number, now: Date = new Date(), rates?: Record<string, number>): Row {
  let tc: Row = taxCenter && typeof taxCenter === "object" ? taxCenter : {};
  loggable(lines).forEach((l, i) => { tc = addBusinessExpense(tc, l.form, l.amount, firstId + i, now, undefined, rates); });
  return tc;
}
