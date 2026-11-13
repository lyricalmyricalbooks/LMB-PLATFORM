// Bank feed (beta): what each bank line most likely is. Money in is looked for among the card payouts, money out among
// the expenses already in the books, then offered as a new expense under the sorting rules' category.
import { describe, expect, it } from "vitest";
import { addOnPriceWords, nextBankWords, type BankLine } from "./bankFeedApi";
import { lineWords, suggestMatches, sureMatches } from "./bankMatch";
import type { PayoutRow } from "./reconcileModel";

const line = (id: string, cents: number, extra: Partial<BankLine> = {}): BankLine => ({ id, bankId: "b1", date: "2026-11-10", cents, currency: "CAD", name: `LINE ${id}`, account: "Chequing ••1234", ...extra });
const payout = (payoutId: string, netCents: number, date: string): PayoutRow => ({ payoutId, date, salesCents: netCents, feesCents: 0, netCents, differenceCents: 0, orders: [{}, {}] } as unknown as PayoutRow);
const kinds = (rows: ReturnType<typeof suggestMatches>) => Object.fromEntries(rows.map((r) => [r.line.id, r.suggestion.kind]));
const base = { payouts: [] as PayoutRow[], taxCenter: null, matches: [], currency: "CAD" };

describe("bank line suggestions", () => {
  it("money in matches the payout of the same amount, from a day before to five days after, each payout once", () => {
    const payouts = [payout("po_1", 5736, "2026-11-09"), payout("po_2", 5736, "2026-11-11")];
    const rows = suggestMatches({ ...base, payouts, lines: [line("a", 5736, { date: "2026-11-10" }), line("b", 5736, { date: "2026-11-12" }), line("c", 5736, { date: "2026-11-13" }), line("late", 9900, { date: "2026-11-30" })] });
    const by = Object.fromEntries(rows.map((r) => [r.line.id, r.suggestion]));
    expect(by.a).toMatchObject({ kind: "payout", payoutId: "po_1", sales: 2 });
    expect(by.b).toMatchObject({ kind: "payout", payoutId: "po_2" });
    expect(by.c.kind).toBe("none");
    expect(by.late.kind).toBe("none");
    expect(rows.map((r) => r.line.id)).toEqual(["late", "c", "b", "a"]);
    // Another currency, a payout already matched, or one outside the days: no match.
    expect(kinds(suggestMatches({ ...base, payouts, lines: [line("usd", 5736, { currency: "USD" })] })).usd).toBe("none");
    expect(kinds(suggestMatches({ ...base, payouts: [payouts[0]], matches: [{ lineId: "x", kind: "payout", ref: "po_1" }], lines: [line("a", 5736)] })).a).toBe("none");
    expect(kinds(suggestMatches({ ...base, payouts: [payout("po_3", 5736, "2026-11-01")], lines: [line("a", 5736)] })).a).toBe("none");
  });

  it("money out matches an expense of the same amount within four days, preferring shared words, each expense once", () => {
    const taxCenter = { businessExpenses: [
      { id: 1, desc: "Canva subscription", amount: 16.99, currency: "CAD", date: "2026-11-08", receipt: { path: "r" } },
      { id: 2, desc: "Paper", amount: 16.99, currency: "CAD", date: "2026-11-10" },
      { id: 3, desc: "Voided", amount: 20, currency: "CAD", date: "2026-11-10", voided: true },
      { id: 4, desc: "US tool", amount: 27.5, origAmount: 20, origCurrency: "USD", currency: "CAD", date: "2026-11-10" },
    ] };
    const rows = suggestMatches({ ...base, taxCenter, lines: [line("canva", -1699, { name: "CANVA* 02913 SYDNEY" }), line("other", -1699), line("third", -1699), line("void", -2000), line("usd", -2000, { currency: "USD" })] });
    const by = Object.fromEntries(rows.map((r) => [r.line.id, r.suggestion]));
    expect(by.canva).toMatchObject({ kind: "expense", expenseId: "1", hasReceipt: true });
    expect(by.other).toMatchObject({ kind: "expense", expenseId: "2", hasReceipt: false });
    expect(by.third.kind).toBe("new");
    expect(by.void.kind).toBe("new");
    expect(by.usd).toMatchObject({ kind: "expense", expenseId: "4" });
    // An expense this feed added or matched before is never offered again.
    expect(kinds(suggestMatches({ ...base, taxCenter, matches: [{ lineId: "x", kind: "added", ref: "2" }, { lineId: "y", kind: "expense", ref: "1" }], lines: [line("a", -1699)] })).a).toBe("new");
  });

  it("a new expense takes the sorting rules' category; a pending line is never matched", () => {
    const taxCenter = { businessExpenses: [], expenseRules: [{ id: "r1", match: "canva", cat: "Software & Subscriptions" }] };
    const rows = suggestMatches({ ...base, taxCenter, payouts: [payout("po_1", 500, "2026-11-10")], lines: [line("canva", -1699, { name: "CANVA* 02913" }), line("unknown", -500), line("wait", 500, { pending: true })] });
    const by = Object.fromEntries(rows.map((r) => [r.line.id, r.suggestion]));
    expect(by.canva.kind).toBe("new");
    expect(by.unknown).toEqual({ kind: "new", cat: "" });
    expect(by.wait).toEqual({ kind: "none" });
  });

  it("Confirm all covers only payouts and expenses already in the books", () => {
    const rows = suggestMatches({ ...base, payouts: [payout("po_1", 5736, "2026-11-10")], taxCenter: { businessExpenses: [{ id: 7, desc: "Paper", amount: 12, currency: "CAD", date: "2026-11-10" }] }, lines: [line("in", 5736), line("out", -1200), line("new", -999)] });
    expect(sureMatches(rows)).toEqual([{ lineId: "in", kind: "payout", ref: "po_1" }, { lineId: "out", kind: "expense", ref: "7" }]);
  });

  it("words: the bank's line tidied, the add-on's price, and what one more bank costs", () => {
    expect(lineWords("  CANVA*   02913  SYDNEY ")).toBe("CANVA* 02913 SYDNEY");
    expect(lineWords("   ")).toBe("Bank payment");
    expect(addOnPriceWords({ price: "CA$4", extraPrice: "CA$1.50", included: 2 })).toBe("CA$4 a month for up to two banks, then CA$1.50 for each extra bank.");
    expect(addOnPriceWords({ price: "", extraPrice: "", included: 2 })).toBe("");
    const addOn = { on: true, price: "CA$4", extraPrice: "CA$1.50", included: 2 };
    const bank = { id: "b", name: "Bank", accounts: [], connectedAt: "" };
    expect(nextBankWords({ addOn, banks: [bank] })).toBe("");
    expect(nextBankWords({ addOn, banks: [bank, bank] })).toBe("One more bank adds CA$1.50 a month.");
  });
});
