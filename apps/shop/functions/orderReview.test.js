// The order review queue (code plan 12.9): which payments wait for the owner, and that a decision stands.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { reviewReasons, reviewOpen, reviewProblem, recordReview } = require("./orderReview.js");
const { labelProblem } = require("./fulfillmentGuard.js");

const NOW = () => new Date("2026-10-29T10:00:00Z");

function fakeDb(order) {
  const store = { "orders/o1": order };
  const ref = { path: "orders/o1" };
  return {
    store,
    collection: () => ({ doc: () => ref }),
    runTransaction: (fn) => fn({
      get: async () => ({ exists: store[ref.path] !== undefined, data: () => structuredClone(store[ref.path]) }),
      update: (_r, fields) => { store[ref.path] = { ...store[ref.path], ...fields }; },
    }),
  };
}

describe("which payments look risky", () => {
  test("a normal payment waits for nobody", () => {
    expect(reviewReasons({ level: "normal", cvcCheck: "pass", postalCheck: "pass", cardCountry: "CA" })).toEqual([]);
    expect(reviewReasons(null)).toEqual([]);
    // Checks that could not be run are not a reason.
    expect(reviewReasons({ level: "not_assessed", cvcCheck: "unavailable", postalCheck: "unchecked" })).toEqual([]);
  });
  test("the card company's rating, a wrong code or a wrong postal code each flag it", () => {
    expect(reviewReasons({ level: "elevated" })).toHaveLength(1);
    expect(reviewReasons({ level: "highest" })[0]).toMatch(/very high risk/);
    expect(reviewReasons({ cvcCheck: "fail" })[0]).toMatch(/security code/);
    expect(reviewReasons({ postalCheck: "fail" })[0]).toMatch(/postal code/);
  });
  test("a card from another country is mentioned only when something else flagged it", () => {
    const order = { customer: { address: { country: "CA" } } };
    expect(reviewReasons({ level: "normal", cardCountry: "US" }, order)).toEqual([]);
    expect(reviewReasons({ level: "elevated", cardCountry: "US" }, order)).toHaveLength(2);
  });
});

describe("flagging an order", () => {
  const paid = { stripePaymentIntentId: "pi_1", paymentStatus: "paid" };
  test("flags once, for the order's own payment only", async () => {
    const db = fakeDb({ ...paid });
    expect(await recordReview(db, "o1", "pi_other", { level: "highest" }, NOW)).toBe(false);
    expect(await recordReview(db, "o1", "pi_1", { level: "normal" }, NOW)).toBe(false);
    expect(await recordReview(db, "o1", "pi_1", { level: "highest" }, NOW)).toBe(true);
    expect(db.store["orders/o1"].review).toMatchObject({ status: "needs_review", flaggedAt: "2026-10-29T10:00:00.000Z" });
  });
  test("an order that already has a review is never flagged again", async () => {
    const db = fakeDb({ ...paid, review: { status: "needs_review", reasons: ["old"] } });
    expect(await recordReview(db, "o1", "pi_1", { level: "highest" }, NOW)).toBe(false);
    expect(db.store["orders/o1"].review.reasons).toEqual(["old"]);
  });
});

describe("waiting and clearing", () => {
  const flagged = { review: { status: "needs_review", reasons: ["x"] } };
  test("open until the owner clears it", () => {
    expect(reviewOpen(flagged, {})).toBe(true);
    expect(reviewOpen(flagged, { reviewCleared: "2026-10-29T11:00:00Z" })).toBe(false);
    expect(reviewOpen({}, {})).toBe(false);
    expect(reviewProblem(flagged, {})).toMatch(/It looks fine/);
    expect(reviewProblem(flagged, { reviewCleared: "x" })).toBe("");
  });
  test("no label while it waits", () => {
    const order = { paymentStatus: "paid", status: "open", items: [{ id: "b1", quantity: 1, format: "Paperback" }], ...flagged };
    expect(labelProblem(order, {})).toMatch(/looks risky/);
  });
});
