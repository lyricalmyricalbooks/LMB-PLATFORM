// The printable trip report, against the old stockroom's exportTripPDF: same sections, the 50% meals limit, receipts.
import { describe, expect, it } from "vitest";

import { tripReceipts, tripReportHtml } from "./tripReport";

const items = [
  { id: 1, date: "2026-05-02", desc: "Train", cat: "Travel", origAmount: 80, origCurrency: "CAD", baseAmount: 80, receipt: "https://files.example/train.jpg" },
  { id: 2, date: "2026-05-01", desc: "Dinner <fair>", cat: "Meals & Entertainment", origAmount: 20, origCurrency: "EUR", baseAmount: 30, receiptFiles: ["local://receipts/dinner.pdf", "https://files.example/bill.pdf?x=1"] },
];
const input = { name: "Spring fair", items, total: 110, deductible: 95, categories: { Travel: 80, "Meals & Entertainment": 30 },
  record: { destination: "Montreal", purpose: "Selling" }, budget: 100, baseCurrency: "CAD", pressName: "Pine Press", printedOn: "May 3, 2026" };

describe("trip report", () => {
  it("prints the totals, the meals limit, the budget and escapes the words", () => {
    const html = tripReportHtml(input);
    expect(html).toContain("Pine Press · prepared May 3, 2026");
    expect(html).toContain("(of $110.00 spent)");
    expect(html).toContain("$15.00 <small>(50% limit)</small>");
    expect(html).toContain("Over by $10.00");
    expect(html).toContain("Dinner &lt;fair&gt;");
    expect(html.indexOf("Dinner")).toBeLessThan(html.indexOf("Train</td>")); // oldest first
  });
  it("shows picture receipts and names the others", () => {
    expect(tripReceipts(items).map((r) => [r.name, r.picture])).toEqual([["train.jpg", true], ["dinner.pdf", false], ["bill.pdf", false]]);
    expect(tripReportHtml(input)).toContain("Kept as files, not shown here: dinner.pdf, bill.pdf");
  });
});
