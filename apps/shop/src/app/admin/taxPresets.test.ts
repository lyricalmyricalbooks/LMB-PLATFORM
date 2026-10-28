import { describe, expect, test } from "vitest";
import { applyTaxPreset, TAX_PRESETS } from "./taxPresets";
import { regionsFor } from "../features/site/postalRegion";
import { taxRateProblem } from "./taxRatesEdit";
import { uncoveredTaxRegions } from "../features/site/taxRate";

const preset = (id: string) => TAX_PRESETS.find((p) => p.id === id)!;

describe("tax presets", () => {
  test("each preset covers every Canadian province and territory with a valid rate", () => {
    const provinces = (regionsFor("Canada") || []).map(([code]) => code).sort();
    for (const p of TAX_PRESETS) {
      expect(Object.keys(p.rates).sort(), p.id).toEqual(provinces);
      const { rates } = applyTaxPreset([], p);
      expect(rates).toHaveLength(provinces.length);
      rates.forEach((r, i) => expect(taxRateProblem(r, rates.filter((_, j) => j !== i)), `${p.id} ${r.region}`).toBe(""));
      expect(uncoveredTaxRegions(rates), p.id).toEqual([]);
    }
  });

  test("printed books pay GST only; other goods pay HST where it applies", () => {
    expect(new Set(Object.values(preset("ca-books").rates))).toEqual(new Set(["5"]));
    const goods = preset("ca-goods").rates;
    expect([goods.ON, goods.NS, goods.NB, goods.QC, goods.BC]).toEqual(["13", "14", "15", "5", "5"]);
  });

  test("a preset never changes a rate the press already has", () => {
    const mine = [{ country: "Canada", region: "Ontario", rate: "0" }, { country: "canada", region: "quebec", rate: "14.975" }];
    const { rates, added, kept } = applyTaxPreset(mine, preset("ca-goods"));
    expect([added, kept]).toEqual([11, 2]);
    expect(rates.slice(0, 2)).toEqual(mine);
    expect(rates.find((r) => r.region === "Nova Scotia")?.rate).toBe("14");
    expect(applyTaxPreset(rates, preset("ca-books")).added).toBe(0);
  });
});
