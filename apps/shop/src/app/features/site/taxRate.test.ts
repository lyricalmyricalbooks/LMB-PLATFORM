import { expect, it } from "vitest";
import { activeTaxRates, matchTaxRate, taxCollectionOn } from "./taxRate";

const rates = [
  { country: "Canada", region: "Ontario", rate: 13 },
  { country: "CA", rate: 5 },
  { country: "USA", region: "NY", rate: 8 },
];

it("matches province names and codes the same way the server does", () => {
  expect(matchTaxRate(rates, "Canada", "ON")?.rate).toBe(13);
  expect(matchTaxRate(rates, "ca", "Ontario")?.rate).toBe(13);
  expect(matchTaxRate(rates, "Canada", "BC")?.rate).toBe(5);
  expect(matchTaxRate(rates, "United States", "New York")?.rate).toBe(8);
  expect(matchTaxRate(rates, "United States", "TX")).toBeNull();
  expect(matchTaxRate(rates, "France", "")).toBeNull();
});

it("tax collection is on unless the owner switched it off, and off means no rates", () => {
  expect(taxCollectionOn({})).toBe(true);
  expect(taxCollectionOn({ taxes: { rates } })).toBe(true);
  expect(taxCollectionOn({ taxes: { rates, collect: false } })).toBe(false);
  expect(activeTaxRates({ taxes: { rates } })).toEqual(rates);
  expect(activeTaxRates({ taxes: { rates, collect: false } })).toEqual([]);
});
