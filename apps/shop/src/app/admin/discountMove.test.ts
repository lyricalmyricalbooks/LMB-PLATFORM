// Discounts › Bring codes over (plan 23.30): an old shop's discount codes, read in the browser.
import { describe, expect, it } from "vitest";
import { describeMoved, readDiscountFile } from "./discountMove";

const TODAY = "2026-11-03";

describe("reading an old shop's discount codes (plan 23.30)", () => {
  it("brings simple codes over with the uses they have left, and says why others stay behind", () => {
    const file = [
      "Name,Value,Value Type,Type,Minimum Purchase Requirements,Times Used,Usage Limit Per Code,Once Per Customer,Starts,Ends,Status",
      "WELCOME10,-10.0,percentage,Amount off order,,3,,TRUE,2025-01-01,,Active",
      "FIVEOFF,-5.00,fixed_amount,Amount off order,Minimum purchase of $50.00,2,10,FALSE,2025-01-01,2027-01-01,Active",
      "SHIPFREE,0,,Free shipping,,0,,FALSE,2025-01-01,,Active",
      "TWOFOR,-10,percentage,Amount off order,Minimum quantity of 2 items,0,,FALSE,,,Active",
      "OLDSALE,-20,percentage,Amount off order,,0,,FALSE,2024-01-01,2025-01-01,Expired",
      "GONE,-20,percentage,Amount off order,,0,,FALSE,2024-01-01,2025-01-01,",
      "MAXED,-5,fixed_amount,Amount off order,,10,10,FALSE,,,Active",
      "BOGO1,-100,percentage,Buy X get Y,,0,,FALSE,,,Active",
      "welcome10,-15,percentage,Amount off order,,0,,FALSE,,,Active",
      "MY CODE!,-15,percentage,Amount off order,,0,,FALSE,,,Active",
      "HERE,-15,percentage,Amount off order,,0,,FALSE,,,Active",
    ].join("\n");
    const read = readDiscountFile(file, TODAY, ["here"]);
    expect(read.problems).toEqual([]);
    expect(read.codes.map((c) => [c.code, describeMoved(c), c.usageLimit, c.onePerCustomer])).toEqual([
      ["WELCOME10", "10% off", null, true],
      ["FIVEOFF", "CA$5.00 off", 8, false],
      ["SHIPFREE", "Free shipping", null, false],
      ["TWOFOR", "10% off", null, false],
    ]);
    expect(read.codes[1]).toMatchObject({ minOrderAmount: 50, minQuantity: null, startDate: "2025-01-01", expiryDate: "2027-01-01" });
    expect(read.codes[3]).toMatchObject({ minOrderAmount: null, minQuantity: 2 });
    expect(read.skipped.map((s) => s.reason)).toEqual([
      "OLDSALE: turned off or ended in your old shop",
      "GONE: already ended",
      "MAXED: used up",
      "BOGO1: a buy-some-get-some offer; set it up by hand in Discounts",
      "WELCOME10: already here",
      "MY CODE!: codes here use 3 to 32 letters, numbers, hyphens or underscores; add it by hand with a new code",
      "HERE: already here",
    ]);
  });

  it("reads other layouts: coupon files with a percent type, amounts and product limits", () => {
    const file = [
      "Coupon code,Discount type,Coupon amount,Usage count,Usage limit per coupon,Expiry date,Minimum spend,Products",
      "SPRING,percent,15,1,5,2027-04-01,,",
      "TENOFF,fixed_cart,10,0,,,,",
      "ZINES,percent,10,0,,,,\"123,456\"",
    ].join("\n");
    const read = readDiscountFile(file, TODAY);
    expect(read.codes.map((c) => [c.code, describeMoved(c), c.usageLimit, c.expiryDate])).toEqual([
      ["SPRING", "15% off", 4, "2027-04-01"],
      ["TENOFF", "CA$10.00 off", null, null],
    ]);
    expect(read.skipped.map((s) => s.reason)).toEqual(["ZINES: only for some items; set it up by hand in Discounts, choosing those items"]);
  });

  it("says when a file isn't a list of codes", () => {
    expect(readDiscountFile("", TODAY).problems).toEqual(["This file is empty."]);
    expect(readDiscountFile("Email,Name\na@example.com,Ada", TODAY).problems[0]).toMatch(/doesn't look like a list of discount codes/);
  });
});
