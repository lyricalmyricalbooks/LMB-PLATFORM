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
