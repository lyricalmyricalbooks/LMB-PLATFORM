import { describe, it, expect } from "vitest";
import { currencyForTimeZone } from "./CurrencyContext";
import { stockAlertId, isValidAlertEmail } from "./features/site/BackInStockForm";

describe("first-visit currency", () => {
  it("starts every Canadian time zone in CAD", () => {
    for (const tz of ["America/Edmonton", "America/Halifax", "America/Winnipeg", "America/Regina", "America/St_Johns", "America/Toronto", "America/Vancouver", "Canada/Eastern"]) {
      expect(currencyForTimeZone(tz)).toBe("CAD");
    }
  });
  it("keeps USD for US zones and EUR for Europe", () => {
    expect(currencyForTimeZone("America/Chicago")).toBe("USD");
    expect(currencyForTimeZone("Europe/Paris")).toBe("EUR");
    expect(currencyForTimeZone("")).toBe("CAD");
  });
});

describe("back-in-stock signups", () => {
  it("use one id per address, book and edition (what firestore.rules requires)", () => {
    expect(stockAlertId(" Ada@Example.com", "b1", "pb")).toBe("ada@example.com__b1__pb");
    expect(stockAlertId("ada@example.com", "b1")).toBe("ada@example.com__b1__");
  });
  it("refuse addresses that can't be a document id", () => {
    expect(isValidAlertEmail("a/b@x.com")).toBe(false);
    expect(isValidAlertEmail("ada@example.com")).toBe(true);
  });
});
