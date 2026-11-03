// Today at the fair above the till (FairToday.tsx): the one line, per currency, in the shop's words; quiet on a day
// with nothing to show.
import { describe, expect, it } from "vitest";
import { fairLine, fairWorthShowing, totalsText } from "./FairToday";
import { goodsWords } from "./sells";
import type { StockroomFair } from "./stockroomBridge";

const fair = (over: Partial<StockroomFair> = {}): StockroomFair => ({
  day: "2026-11-03", fair: "Harbour Fair", sales: 2, units: 3,
  totals: [{ cur: "CAD", amount: 48 }, { cur: "USD", amount: 20 }], methods: [], titles: [], upload: { tone: "ok", text: "All uploaded ✓" }, ...over,
});

describe("today at the fair", () => {
  it("says the fair, the sales, the books and the takings per currency", () => {
    const line = fairLine(fair(), (t) => t);
    expect(line).toMatch(/^Harbour Fair · 2 sales · 3 books · /);
    expect(line).toContain(" + ");
    expect(fairLine(fair({ fair: null, sales: 1, units: 1, totals: [{ cur: "CAD", amount: 24 }] }), (t) => t)).toMatch(/^1 sale · 1 book · /);
  });
  it("speaks of products for a general shop", () => {
    expect(fairLine(fair(), goodsWords)).toContain("3 products");
  });
  it("shows nothing on a quiet day or before the stockroom answers", () => {
    expect(fairWorthShowing(null)).toBe(false);
    expect(fairWorthShowing(fair({ sales: 0, fair: null }))).toBe(false);
    expect(fairWorthShowing(fair({ sales: 0 }))).toBe(true);
    expect(totalsText([])).toMatch(/0/);
  });
});
