// Regression tests for the round-2 payment/checkout fixes that live in the browser code:
// free-shipping bar counts printed books only, box-set shipping weights, exact charged totals,
// duplicate-order line matching, failed-refund queue/alert, and the checkout safeguards.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { shippableBagTotal } from "./freeShipThreshold";
import { bundleWeightGrams } from "./promotions";
import { orderChargedTotal } from "./orderMoney";
import { sameOrderLines } from "./orderLines";
import { queueOf, blockingProblem, refundFailed } from "../../admin/fulfillment";
import { buildAdminAlerts } from "../../admin/adminAlerts";

const require = createRequire(import.meta.url);
const checkout = readFileSync(new URL("../../Checkout.tsx", import.meta.url), "utf8");

describe("fault 13: free-shipping bar", () => {
  it("counts printed books only, as checkout does", () => {
    const items = [{ price: 25, quantity: 1, physical: true }, { price: 30, quantity: 1, physical: false }];
    expect(shippableBagTotal(items, 55)).toBe(25);
    expect(shippableBagTotal(null, 55)).toBe(55);
    expect(shippableBagTotal([{ price: 50, quantity: 1, physical: false }], 50)).toBe(0);
  });
});

describe("fault 14: box-set shipping weight", () => {
  const books = new Map<string, any>([
    ["a", { weight: "300 g", variants: [{ id: "hc", weight: "900 g" }] }],
    ["b", { weight: "0.5 kg" }],
  ]);
  it("adds each part at its edition's weight times its quantity", () => {
    expect(bundleWeightGrams({ bundleItems: [{ bookId: "a", variantId: "hc", quantity: 2 }, { bookId: "b", quantity: 1 }] }, books)).toBe(2300);
  });
  it("is null when a part has no weight or is missing, and for non-sets", () => {
    expect(bundleWeightGrams({ bundleItems: [{ bookId: "x", quantity: 1 }] }, books)).toBeNull();
    expect(bundleWeightGrams({ bundleItems: [{ bookId: "a", quantity: 1 }] }, new Map([["a", {}]]))).toBeNull();
    expect(bundleWeightGrams({}, books)).toBeNull();
  });
  it("Checkout weighs a set with this helper", () => {
    expect(checkout).toMatch(/bundleWeightGrams\(book, booksMap\)/);
  });
});

describe("fault 40: exact charged total", () => {
  const money = (cad: number) => `CA$ ${cad.toFixed(2)}`;
  it("prints the amount the server charged when the order carries it", () => {
    const order = { total: 40, checkoutCurrency: "USD", exchangeRate: 0.7333, expectedAmountMinor: 2934, expectedCurrency: "USD" };
    expect(orderChargedTotal(order, money)).toBe("$ 29.34");
  });
  it("falls back to total x rate, or CAD, for older orders", () => {
    expect(orderChargedTotal({ total: 40, checkoutCurrency: "USD", exchangeRate: 0.7 }, money)).toBe("$ 28.00");
    expect(orderChargedTotal({ total: 40 }, money)).toBe("CA$ 40.00");
  });
  it("the public order view exposes the fields", () => {
    const { publicOrderView } = require("../../../../functions/orderAccess.js");
    const view = publicOrderView("o1", { total: 40, expectedAmountMinor: 2934, expectedCurrency: "USD", customer: {}, items: [] });
    expect(view).toMatchObject({ expectedAmountMinor: 2934, expectedCurrency: "USD" });
  });
});

describe("fault 41: duplicate-order matching", () => {
  it("matches by book, edition and copies; ignores the free gift", () => {
    expect(sameOrderLines([{ id: "a", quantity: 1 }], [{ id: "a", quantity: 1 }, { id: "g", quantity: 1, promoGift: true }])).toBe(true);
    expect(sameOrderLines([{ id: "a", quantity: 1 }], [{ id: "b", quantity: 1 }])).toBe(false);
    expect(sameOrderLines([{ id: "a", variantId: "x", quantity: 1 }], [{ id: "a", quantity: 1 }])).toBe(false);
  });
  it("the previous-paid landing leaves a different bag alone", () => {
    expect(checkout).toMatch(/isPreviousPaid && !sameOrderLines\(cartRef\.current, order\.items\)/);
  });
});

describe("fault 42: aged-out card attempt", () => {
  it("asks for the order's payment status before creating another payment", () => {
    expect(checkout).toMatch(/if \(!clientSecret && reuse\) \{[\s\S]*action: "status", orderId[\s\S]*paymentSettled\(statusData\?\.status\)/);
  });
});

describe("fault 57: PayPal total", () => {
  it("compares the server's PayPal amount with the screen total before redirecting", () => {
    expect(checkout).toMatch(/paypalData\.amount[\s\S]*totalNeedsConfirming\(paypalMinor, shownMinor[\s\S]*window\.location\.href = paypalData\.approvalUrl/);
  });
});

describe("fault 39: failed refund needs attention", () => {
  const failed = { paymentStatus: "paid", status: "open", fulfillmentStatus: "paid", items: [{ id: "a", quantity: 1, format: "Paperback" }], refund: { status: "failed", id: "re_1" },
    customer: { address: { street: "1 A", city: "T", state: "ON", zip: "M6G3H1", country: "CA" } } };
  it("moves the order to Needs attention with an explanation", () => {
    expect(queueOf(failed)).toBe("Needs attention");
    expect(blockingProblem(failed)).toMatch(/refund for this order failed/);
    expect(refundFailed(failed)).toBe(true);
    expect(refundFailed({ ...failed, refund: { status: "succeeded" } })).toBe(false);
  });
  it("raises an admin alert, even for a finished order", () => {
    const alerts = buildAdminAlerts([{ id: "X", ...failed, status: "completed", createdAt: new Date().toISOString() }]);
    expect(alerts.map((a) => a.id)).toContain("refund-failed");
    expect(buildAdminAlerts([{ id: "Y", ...failed, refund: { status: "succeeded" }, createdAt: new Date().toISOString() }]).map((a) => a.id)).not.toContain("refund-failed");
  });
});
