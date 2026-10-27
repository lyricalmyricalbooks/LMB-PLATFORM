import { describe, it, expect } from "vitest";
import { repriceCart, lineQuantityCap } from "./CartContext";
import { orderMoney, amountIn, totalNeedsConfirming } from "./features/site/orderMoney";

const line = (over: any = {}) => ({ id: "b1", title: "Book", price: 20, quantity: 2, photoUrl: "", ...over });

describe("repriceCart", () => {
  it("uses today's catalog price, like the server", () => {
    const r = repriceCart([line()], [{ id: "b1", retailPrice: 25 }]);
    expect(r.changed).toBe(true);
    expect(r.cart[0].price).toBe(25);
    expect(r.repriced).toEqual(["Book"]);
  });

  it("drops an ended sale price", () => {
    const r = repriceCart([line({ price: 10 })], [{ id: "b1", retailPrice: 20, isOnSale: false, salePrice: 10 }]);
    expect(r.cart[0].price).toBe(20);
  });

  it("removes books that are gone, sold out or have no price", () => {
    const r = repriceCart(
      [line(), line({ id: "b2", title: "Gone" }), line({ id: "b3", title: "Sold" }), line({ id: "b4", title: "Edition", variantId: "v9" })],
      [{ id: "b1", retailPrice: 20 }, { id: "b3", retailPrice: 20, trackInventory: true, stockLevel: 0 }, { id: "b4", retailPrice: 20, variants: [{ id: "v1", price: 5 }] }],
    );
    expect(r.cart.map(i => i.id)).toEqual(["b1"]);
    expect(r.removed).toEqual(["Gone", "Sold", "Edition"]);
  });

  it("caps quantity at current stock", () => {
    const r = repriceCart([line({ quantity: 5 })], [{ id: "b1", retailPrice: 20, trackInventory: true, stockLevel: 3 }]);
    expect(r.cart[0].quantity).toBe(3);
    expect(r.cart[0].stockLimit).toBe(3);
  });

  it("leaves an up-to-date bag alone (no re-render loop)", () => {
    const cart = [line({ stockLimit: 999 })];
    const r = repriceCart(cart, [{ id: "b1", retailPrice: 20 }]);
    expect(r.changed).toBe(false);
    expect(r.cart).toBe(cart);
  });

  it("never allows more than 99 copies", () => {
    expect(lineQuantityCap(999)).toBe(99);
    expect(lineQuantityCap(undefined)).toBe(99);
    expect(lineQuantityCap(4)).toBe(4);
  });
});

describe("orderMoney", () => {
  it("shows a USD order in USD at its saved rate", () => {
    expect(orderMoney(10, { checkoutCurrency: "USD", exchangeRate: 0.73 }, n => `CA$ ${n}`)).toBe("$ 7.30");
    expect(orderMoney(10, {}, n => `CA$ ${n.toFixed(2)}`)).toBe("CA$ 10.00");
    expect(amountIn(15.2, "cad")).toBe("CA$ 15.20");
  });
});

describe("totalNeedsConfirming", () => {
  it("lets rounding and exchange-rate drift through", () => {
    expect(totalNeedsConfirming(7310, 7308, "USD")).toBe(false); // USD 5 × 19.99, per-line rounding
    expect(totalNeedsConfirming(15276, 15274, "CAD")).toBe(false); // CAD 6 × 29.95 with 15% off
    expect(totalNeedsConfirming(7350, 7308, "USD")).toBe(false); // under 1% rate change
    expect(totalNeedsConfirming(7350, 7308, "eur")).toBe(false);
  });
  it("stops a real price change", () => {
    expect(totalNeedsConfirming(9000, 7308, "USD")).toBe(true);
    expect(totalNeedsConfirming(120, 100, "CAD")).toBe(true);
  });
  it("allows only 5 cents of rounding in CAD: no exchange rate can drift", () => {
    // A 30-cent CAD change on a $73 order is a real price change, not a rate wobble.
    expect(totalNeedsConfirming(7338, 7308, "CAD")).toBe(true);
    expect(totalNeedsConfirming(7338, 7308)).toBe(true); // no currency = CAD
    expect(totalNeedsConfirming(7313, 7308, "CAD")).toBe(false);
    expect(totalNeedsConfirming(7338, 7308, "USD")).toBe(false);
  });
});
