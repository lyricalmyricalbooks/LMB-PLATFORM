import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isCheckoutAttempt, hasOwnershipProof, SERVER_PAYMENT_FIELDS } = require("./emailProof");

const dbWith = (orders, fail = false) => ({
  collection: vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(() => ({
        get: async () => {
          if (fail) throw new Error("boom");
          return { docs: orders.map(data => ({ data: () => data })) };
        },
      })),
    })),
  })),
});
const authWith = user => ({
  getUserByEmail: async () => {
    if (!user) throw new Error("no user");
    return user;
  },
});

describe("isCheckoutAttempt", () => {
  it("is true for each server-written payment field", () => {
    for (const field of SERVER_PAYMENT_FIELDS) expect(isCheckoutAttempt({ [field]: "x" })).toBe(true);
  });
  it("ignores empty, null and missing values and non-objects", () => {
    expect(isCheckoutAttempt({ stripePaymentIntentId: "" })).toBe(false);
    expect(isCheckoutAttempt({ paypalOrderId: null })).toBe(false);
    expect(isCheckoutAttempt({ customer: { email: "a@b.c" } })).toBe(false);
    expect(isCheckoutAttempt(null)).toBe(false);
    expect(isCheckoutAttempt("order")).toBe(false);
  });
});

describe("hasOwnershipProof", () => {
  it("refuses a blank address without asking anything", async () => {
    const db = dbWith([]);
    expect(await hasOwnershipProof(db, authWith(null), "  ")).toBe(false);
    expect(db.collection).not.toHaveBeenCalled();
  });
  it("accepts an address with a real checkout attempt", async () => {
    expect(await hasOwnershipProof(dbWith([{}, { expectedAmountMinor: 1200 }]), authWith(null), "A@B.com")).toBe(true);
  });
  it("does not accept orders with only browser-writable fields", async () => {
    expect(await hasOwnershipProof(dbWith([{ total: 10 }]), authWith(null), "a@b.com")).toBe(false);
  });
  it("accepts a verified account but not an unverified one", async () => {
    const db = dbWith([]);
    expect(await hasOwnershipProof(db, authWith({ emailVerified: true, email: "A@b.com" }), "a@b.com")).toBe(true);
    expect(await hasOwnershipProof(db, authWith({ emailVerified: false, email: "a@b.com" }), "a@b.com")).toBe(false);
  });
  it("never throws: a failed order lookup falls through to the account check", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await hasOwnershipProof(dbWith([], true), authWith({ emailVerified: true, email: "a@b.com" }), "a@b.com")).toBe(true);
    expect(await hasOwnershipProof(dbWith([], true), authWith(null), "a@b.com")).toBe(false);
  });
});
