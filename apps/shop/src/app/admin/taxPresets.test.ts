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

  test("each province's total on a printed book and an e-book (plan 5.10)", () => {
    const printed = preset("ca-books").rates;
    const ebook = preset("ca-ebooks").rates;
    // Province: [printed book, e-book]. Printed books: GST only (HST give-back, PST/RST exempt, QST zero-rated with
    // an ISBN). E-books: full HST, GST + QST in Quebec, GST only where PST/RST exempts them.
    const expected: Record<string, [string, string]> = {
      ON: ["5", "13"], NS: ["5", "14"], NB: ["5", "15"], NL: ["5", "15"], PE: ["5", "15"],
      QC: ["5", "14.975"], BC: ["5", "5"], SK: ["5", "5"], MB: ["5", "5"],
      AB: ["5", "5"], NT: ["5", "5"], NU: ["5", "5"], YT: ["5", "5"],
    };
    for (const [code, [book, digital]] of Object.entries(expected)) {
      expect([code, printed[code], ebook[code]]).toEqual([code, book, digital]);
    }
  });

  test("other goods with provincial sales tax add PST, RST and QST to GST", () => {
    const goods = preset("ca-goods-provincial").rates;
    expect([goods.BC, goods.SK, goods.MB, goods.QC]).toEqual(["12", "11", "12", "14.975"]);
    expect([goods.ON, goods.NS, goods.NB, goods.AB]).toEqual(["13", "14", "15", "5"]);
    const named = Object.fromEntries(applyTaxPreset([], preset("ca-goods-provincial")).rates.map((r) => [r.region, r.bookName]));
    expect([named["British Columbia"], named.Saskatchewan, named.Manitoba, named.Quebec, named.Ontario, named.Alberta])
      .toEqual(["GST + PST BC", "GST + PST SK", "GST + RST MB", "GST + QST", "HST ON", "GST"]);
    expect(Object.fromEntries(applyTaxPreset([], preset("ca-ebooks")).rates.map((r) => [r.region, r.bookName])).Quebec).toBe("GST + QST");
  });

  test("every preset says what it covers in plain words", () => {
    for (const p of TAX_PRESETS) expect(p.description.length, p.id).toBeGreaterThan(40);
    expect(preset("ca-goods-provincial").description).toMatch(/only if you are registered/);
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
