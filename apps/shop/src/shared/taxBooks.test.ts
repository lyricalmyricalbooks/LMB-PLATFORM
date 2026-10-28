import { describe, expect, test } from "vitest";
import { suggestedTaxBookName, taxBookName, taxLinesFor } from "./taxBooks";
import { applyTaxPreset, TAX_PRESETS } from "../app/admin/taxPresets";
import { cleanTaxRate } from "../app/admin/taxRatesEdit";

describe("names in your books (plan 7.11)", () => {
  test("suggested names follow the place and the rate", () => {
    const name = (region: string, rate: string, country = "Canada") => suggestedTaxBookName({ country, region, rate });
    expect(name("Alberta", "5")).toBe("GST");
    expect(name("Ontario", "13")).toBe("HST ON");
    expect(name("NS", "14")).toBe("HST NS");
    expect(name("Québec", "9.975")).toBe("QST");
    expect(name("Quebec", "14.975")).toBe("GST + QST");
    expect(name("British Columbia", "7")).toBe("PST BC");
    expect(name("British Columbia", "12")).toBe("GST + PST BC");
    expect(name("Ontario", "0")).toBe("Exempt");
    expect(name("New York", "8.875", "United States")).toBe("Sales tax New York");
    expect(suggestedTaxBookName(null)).toBe("Sales tax");
  });

  test("a typed name wins, trimmed", () => {
    expect(taxBookName({ country: "Canada", region: "Ontario", rate: "13", bookName: "  HST payable " })).toBe("HST payable");
    expect(taxBookName({ country: "Canada", region: "Ontario", rate: "13", bookName: " " })).toBe("HST ON");
    expect(cleanTaxRate({ country: "Canada", region: "Ontario", rate: "13", bookName: "  HST   ON " })).toEqual({ country: "Canada", region: "Ontario", rate: "13", bookName: "HST ON" });
  });

  test("each preset fills a name for every rate it adds", () => {
    for (const preset of TAX_PRESETS) {
      const { rates } = applyTaxPreset([], preset);
      for (const r of rates) expect(r.bookName, `${preset.id} ${r.region}`).toBe(suggestedTaxBookName(r));
    }
    const goods = applyTaxPreset([], TAX_PRESETS.find((p) => p.id === "ca-goods")!).rates;
    expect(goods.find((r) => r.region === "Ontario")?.bookName).toBe("HST ON");
    expect(goods.find((r) => r.region === "Alberta")?.bookName).toBe("GST");
    expect(new Set(applyTaxPreset([], TAX_PRESETS.find((p) => p.id === "ca-books")!).rates.map((r) => r.bookName))).toEqual(new Set(["GST"]));
  });

  test("an order's tax lines add up to its tax total, to the cent", () => {
    const on = { country: "Canada", region: "Ontario", rate: "13" };
    const ab = { country: "Canada", region: "Alberta", rate: "5" };
    // Pickup in Ontario (printed books) with an e-book taxed where the shopper lives.
    const parts = [{ rate: on, amount: 17.995 * 0.13 }, { rate: ab, amount: 9.99 * 0.05 }];
    const lines = taxLinesFor(parts);
    expect(lines.map((l) => l.name)).toEqual(["HST ON", "GST"]);
    expect(lines.reduce((s, l) => s + l.cents, 0)).toBe(Math.round((17.995 * 0.13 + 9.99 * 0.05) * 100));
    // Same name merges; nothing charged gives no line.
    expect(taxLinesFor([{ rate: ab, amount: 0.25 }, { rate: { ...ab, region: "Yukon" }, amount: 0.25 }])).toEqual([{ name: "GST", cents: 50 }]);
    expect(taxLinesFor([{ rate: null, amount: 0 }])).toEqual([]);
    // Rounding cents land on the largest line, so the lines still equal the total.
    for (let i = 1; i < 200; i++) {
      const p = [{ rate: on, amount: i * 0.0137 }, { rate: ab, amount: i * 0.0051 }, { rate: { country: "Canada", region: "Quebec", rate: "9.975" }, amount: i * 0.0033 }];
      const sum = p.reduce((s, x) => s + x.amount, 0);
      expect(taxLinesFor(p).reduce((s, l) => s + l.cents, 0), `case ${i}`).toBe(Math.round(sum * 100));
    }
  });
});
