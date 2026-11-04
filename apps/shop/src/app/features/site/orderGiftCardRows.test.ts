import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { orderGiftCardRows } from "./orderMoney";

const { publicOrderView } = createRequire(import.meta.url)("../../../../functions/orderAccess.js");

describe("gift cards on the order page and the account's order history", () => {
  // Subtotal 50 + shipping 10 + tax 6.50 = 66.50, of which a gift card paid 20: the card is charged 46.50.
  const order = {
    subtotal: 50, discount: 0, shipping: 10, tax: 6.5, total: 46.5, giftCardAmount: 20,
    giftCardRedemptions: [{ id: "secret-card-id", last4: "WXYZ", minor: 1500 }, { id: "other", last4: "ABCD", minor: 500 }],
  };

  it("lists each card that paid, so the summary adds up to the total", () => {
    const rows = orderGiftCardRows(publicOrderView("o1", order));
    expect(rows).toEqual([{ last4: "WXYZ", cad: 15 }, { last4: "ABCD", cad: 5 }]);
    const sum = order.subtotal - order.discount + order.shipping + order.tax - rows.reduce((s, r) => s + r.cad, 0);
    expect(Math.round(sum * 100) / 100).toBe(order.total);
  });

  it("shows one row for an older order with only the amount, and none without a gift card", () => {
    expect(orderGiftCardRows({ giftCardAmount: 12.5 })).toEqual([{ last4: "", cad: 12.5 }]);
    expect(orderGiftCardRows({ total: 30 })).toEqual([]);
    expect(orderGiftCardRows({ giftCardRedemptions: [{ last4: "WXYZ", minor: 0 }] })).toEqual([]);
  });

  it("is shown on both pages, in the checkout's own gift card words", () => {
    for (const file of ["OrderTracking.tsx", "Account.tsx"]) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source, file).toMatch(/orderGiftCardRows\((order|o)\)\.map/);
      expect(source, file).toContain('"coGiftCardSummary"');
    }
  });
});
