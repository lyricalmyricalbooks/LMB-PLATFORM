import { describe, expect, it } from "vitest";
import { currencyName, currencySign, shopCurrencyOf, shopMoney } from "./shopCurrency";

describe("the shop's own currency", () => {
  it("is Canadian dollars unless the shop says US dollars", () => {
    expect(shopCurrencyOf(undefined)).toBe("CAD");
    expect(shopCurrencyOf("")).toBe("CAD");
    expect(shopCurrencyOf("GBP")).toBe("CAD");
    expect(shopCurrencyOf(" usd ")).toBe("USD");
    expect(shopCurrencyOf("CAD")).toBe("CAD");
  });

  it("writes money and names the currency", () => {
    expect(shopMoney(1234.5, "USD")).toBe("US$1,234.50");
    expect(shopMoney(-3, undefined)).toBe("-CA$3.00");
    expect(shopMoney(Number.NaN, "CAD")).toBe("CA$0.00");
    expect(currencySign("USD")).toBe("US$");
    expect(currencyName("USD")).toBe("US dollars");
    expect(currencyName(null, true)).toBe("Canadian dollar");
  });
});
