// The tax-season file, checked line by line against what the old stockroom's export wrote for the same records.
import { describe, expect, it } from "vitest";
import { calcArtistEarnings } from "@stockroom/earnings.js";

import { artistEarningsInYear, isExpenseAwaitingRate, taxSeasonExport } from "./taxSeason";
import { inPersonTaxHint, withInPersonTax } from "./TaxSeason";

const tiers = [{ revenueUpTo: 100, artistPct: 10 }, { revenueUpTo: null, artistPct: 50 }];
const salt = { id: "salt", title: "Salt Hours", currency: "CAD", profitTiers: tiers };
const euro = { id: "euro", title: "Night Ferry", currency: "EUR" };
const states = {
  salt: {
    hist: [
      { date: "2026-05-02", qty: 2, price: 20, chan: "Book Fair" },
      { date: "2026-05-02", qty: 1, price: 13, chan: "In Person" },
      { date: "2025-12-01", qty: 5, price: 20, chan: "Online" },
      { date: "2026-06-01", qty: 1, price: 20, voided: true },
    ],
    expenses: [{ date: "2026-04-01", cat: "Printing & Production", desc: "Print run", amount: 300, baseAmount: 300, receipt: "https://r/1" }],
    artistPayouts: [{ date: "2026-07-01", amount: 25, method: "E-transfer" }],
  },
  euro: { hist: [{ date: "2026-03-03", qty: 1, price: 10 }], expenses: [] },
};
const taxCenter = {
  settings: { inPersonTax: { rate: "13", bookName: "HST ON", included: true } },
  businessExpenses: [
    { date: "2026-02-01", cat: "Software & Subscriptions", desc: "Canva", amount: 16.99, currency: "USD", baseAmount: 23.1 },
    { date: "2026-02-02", cat: "Travel", desc: "Train", amount: 40, currency: "EUR", fxMissing: true, baseAmount: null },
  ],
};

describe("tax-season file", () => {
  const input = { books: [salt, euro], states, taxCenter, fxRateCache: { CAD_CAD: 1, EUR_CAD: 1.5 } };
  const file = taxSeasonExport(input, "2026", { pressName: "Pine Press", today: "2026-11-11" });
  const lines = file.text.replace(/^﻿/, "").split("\n");

  it("heads the file and names it as the old app did", () => {
    expect(lines.slice(0, 3)).toEqual(["Pine Press Tax Season Export", "Generated on: 2026-11-11", "Tax Year: 2026"]);
    expect(file.name).toBe("Pine_Press_Tax_Season_2026_Export.csv");
  });

  it("revenue by book: the year's sales in dollars, net of costs and the author's share for the year", () => {
    // 2026 sales 53 (the 2025 sale and the voided one left out). The author's tiers run over all-time sales: 100 from
    // 2025 fill the 10% tier, so 2026's 53 earn 50% = 26.50. Net 53 − 300 − 26.5.
    expect(lines).toContain('"Salt Hours",53.00,-273.50,3');
    expect(lines).toContain('"Night Ferry",15.00,15.00,1');
  });

  it("fair and in-person sales by day, tax taken out of the prices as set", () => {
    const at = lines.indexOf('"Tax: HST ON at 13%, included in the prices."');
    expect(at).toBeGreaterThan(0);
    expect(lines[at + 1]).toBe('"Date","Sales before tax","Shipping","Discounts","Gift cards sold","Gift cards used","Refunds","HST ON","Card fees","Net","Currency"');
    expect(lines[at + 2]).toBe('"2026-05-02","46.90","0.00","0.00","0.00","0.00","0.00","6.10","0.00","53.00","CAD"');
  });

  it("every expense and payout, a waiting expense counted 0 and flagged", () => {
    expect(lines).toContain('2026-04-01,"Salt Hours","Printing & Production","Print run",300.00,"https://r/1"');
    expect(lines).toContain('2026-07-01,"Salt Hours","Artist Payout","E-transfer",25.00,""');
    expect(lines).toContain('2026-02-01,"Publisher (General)","Software & Subscriptions","Canva",23.10,""');
    expect(lines).toContain('2026-02-02,"Publisher (General)","Travel","Train",0.00,""');
    expect(file.waiting).toBe(1);
    expect(lines).toContain("--- ⚠ EXPENSES WAITING FOR AN EXCHANGE RATE ---");
    expect(isExpenseAwaitingRate(taxCenter.businessExpenses[1])).toBe(true);
  });

  it("a book with no saved rate is flagged as unconverted", () => {
    const f = taxSeasonExport({ ...input, fxRateCache: { CAD_CAD: 1 } }, "2026", { pressName: "Pine Press", today: "2026-11-11" });
    expect(f.unconverted).toEqual([{ title: "Night Ferry", cur: "EUR" }]);
    expect(f.text).toContain('"Night Ferry","EUR",1.00');
  });

  it("the author's share year by year adds up to the lifetime figure", () => {
    const total = (calcArtistEarnings(salt, states.salt) as { totalArtistEarned: number }).totalArtistEarned;
    expect(artistEarningsInYear(salt, states.salt, 2025) + artistEarningsInYear(salt, states.salt, 2026)).toBeCloseTo(total, 2);
  });
});

describe("tax on in-person sales", () => {
  it("saves the setting the old way, and a blank rate takes it off", () => {
    const tc = withInPersonTax({ settings: { baseCurrency: "CAD" } }, { rate: " 13 ", bookName: "  HST   ON ", included: false });
    expect(tc.settings).toEqual({ baseCurrency: "CAD", inPersonTax: { rate: "13", bookName: "HST ON", included: false } });
    expect(withInPersonTax(tc, { rate: "", bookName: "", included: true }).settings).toEqual({ baseCurrency: "CAD" });
  });
  it("says what the export will do", () => {
    expect(inPersonTaxHint({ rate: "", bookName: "", included: true })).toMatch(/before tax/);
    expect(inPersonTaxHint({ rate: "5", bookName: "", included: false })).toBe("In-person sales show GST at 5%, added to the prices.");
    expect(inPersonTaxHint({ rate: "200", bookName: "", included: true })).toMatch(/0 to 100/);
  });
});
