// Bank feed (beta): what each bank line most likely is. Pure. A line of money in is looked for among the card payouts
// (reconcileModel.ts: same amount, a day before to five days after the payout's day); a line of money out among the
// expenses already in the books (same amount and currency, within four days), and failing that it is offered as a new
// expense under the category the shop's sorting rules give its words (taxRules.ts). Nothing here saves anything: the
// owner confirms each one, and a payout or an expense is offered to one bank line only.
import type { BankLine, BankMatch } from "./bankFeedApi";
import type { PayoutRow } from "./reconcileModel";
import { categoryFromRules, normalizeRuleText } from "./taxRules";
import { EXPENSE_CATEGORIES } from "./taxExpense";

type Row = Record<string, any>;

export type Suggestion =
  | { kind: "payout"; payoutId: string; date: string; sales: number }
  | { kind: "expense"; expenseId: string; desc: string; date: string; hasReceipt: boolean }
  | { kind: "new"; /** The sorting rules' category, or "" when no rule fits. */ cat: string }
  | { kind: "none" };
export type SuggestedLine = { line: BankLine; suggestion: Suggestion };

const DAY = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);
const PAYOUT_EARLY = 1, PAYOUT_LATE = 5, EXPENSE_DAYS = 4;

/** Words two descriptions share ("canva" in "CANVA* 02913 SYDNEY" and "Canva subscription"); short words don't count. */
function sharesWord(a: string, b: string): boolean {
  const words = new Set(normalizeRuleText(a).split(" ").filter((w) => w.length >= 4));
  return normalizeRuleText(b).split(" ").some((w) => words.has(w));
}

export function suggestMatches({ lines, payouts, taxCenter, matches, currency }: {
  lines: BankLine[]; payouts: PayoutRow[]; taxCenter: Row | null; matches: BankMatch[]; /** The payouts' currency. */ currency: string;
}): SuggestedLine[] {
  const usedPayouts = new Set(matches.filter((m) => m.kind === "payout").map((m) => m.ref));
  const usedExpenses = new Set(matches.filter((m) => m.kind === "expense" || m.kind === "added").map((m) => String(m.ref)));
  const expenses: Row[] = Array.isArray(taxCenter?.businessExpenses) ? taxCenter!.businessExpenses : [];
  // Oldest first, so the earlier of two same-amount lines takes the earlier payout.
  const ordered = [...lines].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const found = new Map<string, Suggestion>();
  for (const line of ordered) {
    if (line.pending) { found.set(line.id, { kind: "none" }); continue; }
    const day = dayNumber(line.date);
    if (line.cents > 0) {
      let best: PayoutRow | null = null, bestGap = Infinity;
      for (const p of payouts) {
        if (usedPayouts.has(p.payoutId) || p.netCents !== line.cents || line.currency.toUpperCase() !== currency.toUpperCase()) continue;
        // A payout still on its way has no day yet: the amount alone is enough.
        const gap = p.date ? day - dayNumber(p.date) : 0;
        if (gap < -PAYOUT_EARLY || gap > PAYOUT_LATE) continue;
        if (Math.abs(gap) < bestGap) { best = p; bestGap = Math.abs(gap); }
      }
      if (best) { usedPayouts.add(best.payoutId); found.set(line.id, { kind: "payout", payoutId: best.payoutId, date: best.date, sales: best.orders.length }); }
      else found.set(line.id, { kind: "none" });
      continue;
    }
    const spent = -line.cents;
    let best: Row | null = null, bestScore = -Infinity;
    for (const e of expenses) {
      if (e == null || e.id == null || usedExpenses.has(String(e.id)) || e.voided) continue;
      const amount = Math.round(Number(e.origAmount ?? e.amount) * 100);
      if (amount !== spent || String(e.origCurrency || e.currency || "").toUpperCase() !== line.currency.toUpperCase()) continue;
      const gap = Math.abs(day - dayNumber(String(e.date || "")));
      if (!(gap <= EXPENSE_DAYS)) continue;
      const score = (sharesWord(line.name, `${e.desc || ""} ${e.vendor || ""}`) ? 10 : 0) - gap;
      if (score > bestScore) { best = e; bestScore = score; }
    }
    if (best) { usedExpenses.add(String(best.id)); found.set(line.id, { kind: "expense", expenseId: String(best.id), desc: String(best.desc || "Expense"), date: String(best.date || ""), hasReceipt: Boolean(best.receipt) }); }
    else found.set(line.id, { kind: "new", cat: categoryFromRules(taxCenter, line.name, EXPENSE_CATEGORIES) || "" });
  }
  // Shown newest first, like a bank statement.
  return [...lines].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).map((line) => ({ line, suggestion: found.get(line.id) || { kind: "none" } }));
}

/** The lines one "Confirm all" covers: a payout or an expense already in the books with the same amount. Pure. */
export const sureMatches = (rows: SuggestedLine[]): BankMatch[] => rows.flatMap(({ line, suggestion }): BankMatch[] =>
  suggestion.kind === "payout" ? [{ lineId: line.id, kind: "payout", ref: suggestion.payoutId }]
    : suggestion.kind === "expense" ? [{ lineId: line.id, kind: "expense", ref: suggestion.expenseId }] : []);

/** A bank's words tidied for an expense's description: "CANVA* 02913 SYDNEY" stays readable, runs of spaces go. Pure. */
export const lineWords = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, 120) || "Bank payment";
