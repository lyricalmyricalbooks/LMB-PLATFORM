// Changes asked for by installed apps (platform plan 26.3b): applied with the shop's own dispatch checks, answered once.
import { describe, test, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { applyAppRequest, APP_REQUEST_OPS } = require("./appRequests");
import { fakeDb, resetClock } from "./inventoryLink.fakes.mjs";

const now = new Date("2026-11-04T15:00:00Z");
const paidOrder = (extra = {}) => ({
  paymentStatus: "paid", paidAt: "2026-11-03T15:00:00.000Z",
  customer: { name: "Ana", email: "a@example.com", address: { street: "1 Main St", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "CA" } },
  items: [{ id: "b1", quantity: 1, price: 40, title: "Moth Songs", format: "Paperback" }], subtotal: 40, total: 40, ...extra,
});
const request = (input, extra = {}) => ({ op: "order.dispatch", appId: "app_1", appName: "Parcel Pal", input, createdAt: now.toISOString(), ...extra });
const ship = { orderId: "A-1", trackingCarrier: "Canada Post", trackingNumber: "1234", trackingUrl: "https://track.example/1234" };
beforeEach(() => resetClock());

describe("order.dispatch", () => {
  test("marks a paid order sent, notes it in the activity, and answers once", async () => {
    const db = fakeDb({ "orders/A-1": paidOrder(), "appRequests/r1": request(ship) });
    const answer = await applyAppRequest(db, "r1", now);
    expect(answer).toMatchObject({ status: "done", result: "dispatched" });
    expect(db.docs["orders/A-1"].data).toMatchObject({ trackingNumber: "1234", trackingSource: "app:app_1", fulfillmentStatus: "shipped", status: "completed" });
    expect(db.docs["order-operations/A-1"].data.activity[0].message).toContain("Parcel Pal");
    const again = await applyAppRequest(db, "r1", new Date("2026-11-04T16:00:00Z"));
    expect(again.answeredAt).toBe(now.toISOString());
    expect(APP_REQUEST_OPS).toEqual(["order.dispatch", "inventory.adjust"]);
  });

  test("tracking only, then sent; the same tracking again is fine", async () => {
    const db = fakeDb({ "orders/A-1": paidOrder(), "appRequests/r1": request({ ...ship, shipped: false }), "appRequests/r2": request(ship), "appRequests/r3": request(ship) });
    expect((await applyAppRequest(db, "r1", now)).result).toBe("attached");
    expect(db.docs["orders/A-1"].data.fulfillmentStatus).toBeUndefined();
    expect((await applyAppRequest(db, "r2", now)).result).toBe("dispatched");
    expect(await applyAppRequest(db, "r3", now)).toMatchObject({ status: "done", reason: "Already sent with this tracking." });
  });

  test("the shop's own checks still apply", async () => {
    const db = fakeDb({
      "orders/A-1": paidOrder({ isTest: true }),
      "orders/A-2": paidOrder(),
      "order-operations/A-2": { hold: "Waiting on the author" },
      "orders/A-3": paidOrder({ paymentStatus: "pending" }),
      "orders/A-4": paidOrder({ trackingNumber: "999", trackingSource: "inventory-app" }),
      "appRequests/r1": request(ship),
      "appRequests/r2": request({ ...ship, orderId: "A-2" }),
      "appRequests/r3": request({ ...ship, orderId: "A-3" }),
      "appRequests/r4": request({ ...ship, orderId: "A-4" }),
    });
    expect((await applyAppRequest(db, "r1", now)).reason).toMatch(/Test orders/);
    expect((await applyAppRequest(db, "r2", now)).reason).toMatch(/on hold/);
    expect((await applyAppRequest(db, "r3", now)).reason).toMatch(/paid/);
    expect((await applyAppRequest(db, "r4", now)).reason).toMatch(/already has tracking 999/);
    expect(db.docs["orders/A-4"].data.trackingNumber).toBe("999");
  });

  test("bad input and unknown changes are refused without touching the order", async () => {
    const db = fakeDb({
      "orders/A-1": paidOrder(),
      "appRequests/r1": request({ ...ship, trackingUrl: "javascript:alert(1)" }),
      "appRequests/r2": request({ ...ship, trackingNumber: "" }),
      "appRequests/r3": request({ ...ship, orderId: "../settings" }),
      "appRequests/r4": request(ship, { op: "order.markPaid" }),
      "appRequests/r5": request({ ...ship, orderId: "nope" }),
    });
    for (const id of ["r1", "r2", "r3", "r4", "r5"]) expect((await applyAppRequest(db, id, now)).status).toBe("refused");
    expect(db.docs["orders/A-1"].data.trackingNumber).toBeUndefined();
  });
});

describe("inventory.adjust", () => {
  const book = { title: "Moth Songs", trackInventory: true, stockLevel: 5 };
  const tote = { title: "Tote", trackInventory: true, variants: [{ id: "s", stockLevel: 2, stock: 2 }, { id: "l", stockLevel: 1, stock: 1 }] };
  const adjust = (input) => ({ op: "inventory.adjust", appId: "app_1", appName: "Fair Till", input, createdAt: now.toISOString() });

  test("adds and takes copies, never below 0; a variant only changes itself", async () => {
    const db = fakeDb({
      "books/b1": book, "books/t1": tote,
      "appRequests/r1": adjust({ productId: "b1", change: -2 }),
      "appRequests/r2": adjust({ productId: "b1", change: -9 }),
      "appRequests/r3": adjust({ productId: "t1", variantId: "l", change: 4 }),
    });
    expect(await applyAppRequest(db, "r1", now)).toMatchObject({ status: "done", result: { available: 3 } });
    expect((await applyAppRequest(db, "r2", now)).result).toEqual({ available: 0 });
    expect((await applyAppRequest(db, "r3", now)).result).toEqual({ available: 5 });
    expect(db.docs["books/t1"].data.variants).toEqual([{ id: "s", stockLevel: 2, stock: 2 }, { id: "l", stockLevel: 5, stock: 5 }]);
  });

  test("expected guards against a sale made meanwhile", async () => {
    const db = fakeDb({ "books/b1": book, "appRequests/r1": adjust({ productId: "b1", change: 5, expected: 4 }), "appRequests/r2": adjust({ productId: "b1", change: 5, expected: 5 }) });
    expect((await applyAppRequest(db, "r1", now)).reason).toMatch(/now 5, not 4/);
    expect((await applyAppRequest(db, "r2", now)).result).toEqual({ available: 10 });
  });

  test("refused: stockroom-linked, not counted, no variant given, bad change", async () => {
    const db = fakeDb({
      "books/b1": book, "books/b2": { ...book, trackInventory: false }, "books/t1": tote,
      "systemStatus/inventoryLink": { links: { b1: { _: "hound" } } },
      "appRequests/r1": adjust({ productId: "b1", change: 1 }),
      "appRequests/r2": adjust({ productId: "b2", change: 1 }),
      "appRequests/r3": adjust({ productId: "t1", change: 1 }),
      "appRequests/r4": adjust({ productId: "t1", variantId: "s", change: 1.5 }),
      "appRequests/r5": adjust({ productId: "t1", variantId: "xl", change: 1 }),
    });
    expect((await applyAppRequest(db, "r1", now)).reason).toMatch(/stockroom/);
    expect((await applyAppRequest(db, "r2", now)).reason).toMatch(/doesn't count stock/);
    expect((await applyAppRequest(db, "r3", now)).reason).toMatch(/variantId/);
    expect((await applyAppRequest(db, "r4", now)).status).toBe("refused");
    expect((await applyAppRequest(db, "r5", now)).reason).toMatch(/no such variant/);
    expect(db.docs["books/b1"].data.stockLevel).toBe(5);
  });
});
