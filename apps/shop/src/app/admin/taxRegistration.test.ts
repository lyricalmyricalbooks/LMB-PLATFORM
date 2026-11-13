import { describe, expect, it } from "vitest";
import { REGISTRATION_WORDS, answerTaxRegistration, provincialPlaces, provincialQuestion, taxRegistration } from "./taxRegistration";
import { TAX_PRESETS } from "./taxPresets";
import { taxCollectionOn } from "../features/site/taxRate";

const preset = (id: string) => TAX_PRESETS.find((p) => p.id === id)!;

describe("registered for GST/HST (15.21)", () => {
  it("starts unanswered, and remembers the answer", () => {
    expect(taxRegistration({})).toBe("unanswered");
    expect(taxRegistration({ taxes: { gstRegistered: true } })).toBe("yes");
    expect(taxRegistration({ taxes: { gstRegistered: false } })).toBe("no");
  });
  it('"No" turns collection off and keeps the saved rates; "Yes" turns it back on', () => {
    const rates = [{ country: "Canada", region: "Ontario", rate: "13" }];
    const no = answerTaxRegistration({ rates }, false);
    expect(no.rates).toEqual(rates);
    expect(taxCollectionOn({ taxes: no })).toBe(false);
    expect(taxCollectionOn({ taxes: answerTaxRegistration(no, true) })).toBe(true);
  });
  it("only presets with a provincial tax ask first, and name the provinces", () => {
    expect(provincialPlaces(preset("ca-books"))).toEqual([]);
    expect(provincialPlaces(preset("ca-goods"))).toEqual([]);
    expect(provincialPlaces(preset("ca-ebooks"))).toEqual(["Quebec"]);
    expect(provincialPlaces(preset("ca-goods-provincial"))).toEqual(["British Columbia", "Saskatchewan", "Manitoba", "Quebec"]);
    expect(provincialQuestion(["Quebec"]).message).toMatch(/registered with that province/);
  });
  it("the words have no technical terms", () => {
    const all = JSON.stringify(REGISTRATION_WORDS);
    expect(all).toMatch(/\$30,000/);
    expect(all).not.toMatch(/settings\.|taxes\.|collect:|boolean|json/i);
  });
});

describe("sales tax in an American shop", () => {
  it("asks about US sales tax, with no Canadian tax names", async () => {
    const { registrationWords, REGISTRATION_WORDS: canadian } = await import("./taxRegistration");
    const us = JSON.stringify(registrationWords("US"));
    expect(registrationWords("CA")).toBe(canadian);
    expect(registrationWords("US").title).toBe("Do you collect sales tax?");
    expect(us).toMatch(/seller's permit/);
    expect(us).not.toMatch(/\$30,000|accountant|lawyer/);
    expect(JSON.stringify({ ...registrationWords("US"), unregisteredPreset: null })).not.toMatch(/GST|HST|province/i);
    expect(JSON.stringify(canadian)).not.toMatch(/accountant|lawyer/);
  });

  it("does not call the states it isn't registered in a gap, and still does for a Canadian shop", async () => {
    const { uncoveredTaxRegions } = await import("../features/site/taxRate");
    const rates = [{ country: "United States", region: "New York", rate: "8" }];
    expect(uncoveredTaxRegions(rates, "US")).toEqual([]);
    expect(uncoveredTaxRegions(rates)[0].country).toBe("United States");
    expect(uncoveredTaxRegions(rates)[0].regions.length).toBeGreaterThan(40);
    expect(uncoveredTaxRegions([{ country: "Canada", region: "Ontario", rate: "13" }], "US")[0].country).toBe("Canada");
  });
});
