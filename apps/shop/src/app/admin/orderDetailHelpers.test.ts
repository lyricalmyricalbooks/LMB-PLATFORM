import { describe, expect, test } from "vitest";
import { blockingProblem, canMarkManualPaid, lockedAddressFields, packingTicksKey } from "./fulfillment";
import { chargedOf, customerMailto, formatMinor, linePricing, parseMoneyToMinor, refundableMinor, returnStepLabel, returnedValueMinor, telHref } from "./orderLines";

const paid = { id: "o1", orderId: "LM-1", paymentStatus: "paid", total: 50, items: [{ id: "a", quantity: 2, price: 20, format: "Paperback" }], customer: { email: "r@x.com", address: {} } };

describe("manual mark paid", () => {
  test("only unpaid cash / e-Transfer orders with money owed", () => {
    expect(canMarkManualPaid({ paymentStatus: "pending", paymentMethod: "e-Transfer", total: 10 })).toBe(true);
    expect(canMarkManualPaid({ paymentStatus: "pending", paymentMethod: "Cash", total: 10 })).toBe(true);
    for (const o of [
      { paymentStatus: "paid", paymentMethod: "Cash", total: 10 },
      { paymentStatus: "unpaid", paymentMethod: "Stripe", total: 10 },
      { paymentStatus: "unpaid", paymentMethod: "e-Transfer", stripePaymentIntentId: "pi_1", total: 10 },
      { paymentStatus: "unpaid", paymentMethod: "PayPal", total: 10 },
      { paymentStatus: "unpaid", paymentMethod: "Free", total: 0 },
      { paymentStatus: "pending", paymentMethod: "Cash", status: "cancelled", total: 10 },
    ]) expect(canMarkManualPaid(o)).toBe(false);
  });
});

describe("blocking problem", () => {
  test("names a dispute, not an address step", () => {
    expect(blockingProblem({ ...paid, disputeStatus: "needs_response" })).toMatch(/disputed/);
    expect(blockingProblem(paid)).toBe("");
    expect(blockingProblem({ ...paid, items: [] })).toMatch(/no items/);
  });
});

test("address locks follow the server's rule", () => {
  expect(lockedAddressFields(paid).fields).toEqual(["state", "country"]);
  expect(lockedAddressFields({ ...paid, fulfillmentSelection: { method: "local_delivery" } }).fields).toContain("zip");
});

test("packing tick key changes with the items", () => {
  expect(packingTicksKey(paid)).not.toBe(packingTicksKey({ ...paid, items: [{ ...paid.items[0], quantity: 3 }] }));
});

describe("money", () => {
  test("line pricing includes add-ons", () => {
    expect(linePricing({ price: 25, basePrice: 20, quantity: 2, addOns: [{ label: "Signed", price: 5 }] })).toEqual({ unit: 25, total: 50, base: 20, addOns: [{ label: "Signed", price: 5 }] });
  });
  test("charged amount and what is left to refund", () => {
    expect(chargedOf({ total: 50, expectedAmountMinor: 3700, expectedCurrency: "usd" })).toEqual({ minor: 3700, currency: "USD" });
    expect(refundableMinor({ total: 50, refundedAmountMinor: 1200 })).toBe(3800);
    expect(formatMinor(1240, "CAD")).toContain("12.40");
    expect(parseMoneyToMinor("12.4")).toBe(1240);
    expect(parseMoneyToMinor("1.234")).toBeNull();
    expect(parseMoneyToMinor("")).toBeNull();
  });
  test("returned value scales to the payment currency and is capped", () => {
    expect(returnedValueMinor(paid, { 0: 1 })).toBe(2000);
    expect(returnedValueMinor({ ...paid, expectedAmountMinor: 3500, expectedCurrency: "USD" }, { 0: 1 })).toBe(1400);
    expect(returnedValueMinor({ ...paid, refundedAmountMinor: 4000 }, { 0: 2 })).toBe(1000);
  });
});

test("return steps read as plain words", () => {
  expect(returnStepLabel("approved")).toBe("Step 2 of 4 — waiting for the parcel to come back");
});

test("contact links are encoded", () => {
  expect(customerMailto(paid)).toBe("mailto:r@x.com?subject=Your%20order%20LM-1");
  expect(customerMailto({ customer: { email: "a@b.c?bcc=x" } })).toBe("");
  expect(telHref("+1 (416) 555-0100")).toBe("tel:+14165550100");
  expect(telHref("")).toBe("");
});
