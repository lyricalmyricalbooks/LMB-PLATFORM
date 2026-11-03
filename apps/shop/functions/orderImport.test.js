// Past orders brought over from the old shop (plan 23.7): history only. No stock, no email, no payment; a re-run adds none.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importPastOrders, handlePastOrdersImport, pastOrderId } = require("./orderImport.js");
const { pushKind } = require("./inventoryLink.js");
const { returnRequestProblem } = require("./shared/returnRequests.js");
const { buildOrderDigest } = require("./orderDigest.js");

/** A pretend Firestore whose create() refuses a document that exists, as the real one does. */
function fakeDb() {
  const docs = new Map();
  return {
    docs,
    collection: (name) => ({ doc: (id) => ({ path: `${name}/${id}` }), add: async (data) => { docs.set(`${name}/auto${docs.size}`, data); } }),
    async runTransaction(fn) {
      const writes = [];
      const out = await fn({ get: async (r) => ({ exists: docs.has(r.path) }), create: (r, d) => writes.push([r.path, d]) });
      for (const [path, d] of writes) { if (docs.has(path)) throw new Error("ALREADY_EXISTS"); docs.set(path, d); }
      return out;
    },
  };
}

const NOW = new Date("2026-11-03T12:00:00Z");
const ORDERS = [
  { oldRef: "#1001", number: "#1001", orderedAt: "2025-06-01T15:30:00Z", email: "Ada@Example.com", name: "Ada", currency: "CAD",
    items: [{ title: "Moth Songs", quantity: 2, price: 20 }, { title: "Zine", quantity: 1, price: 8 }], subtotal: 48, shipping: 10, tax: 6.24, total: 64.24 },
  { oldRef: "#1002", orderedAt: "2025-07-02", total: 30, refunded: 30, email: "ben@example.com" },
  { oldRef: "#1003", orderedAt: "2025-07-02", total: 30, currency: "USD" },
  { oldRef: "#1004", orderedAt: "someday", total: 30 },
  { oldRef: "#1005", orderedAt: "2027-01-01", total: 30 },
  { oldRef: "", orderedAt: "2025-07-02", total: 30 },
];

describe("bringing past orders over (plan 23.7)", () => {
  it("each becomes a paid, delivered past order for the reports and the customer's history, or says why not", async () => {
    const db = fakeDb();
    const { added, skipped } = await importPastOrders(db, ORDERS, { actor: "owner@example.com", now: NOW });
    expect(added).toEqual([pastOrderId("#1001"), pastOrderId("#1002")]);
    expect(skipped.map((s) => s.reason)).toEqual(["in USD, and this shop sells in Canadian dollars", "its date couldn't be read", "its date is in the future", "nothing to tell it apart"]);
    const first = db.docs.get(`orders/${pastOrderId("#1001")}`);
    expect(first).toMatchObject({
      source: "import", importedFrom: "#1001", oldOrderNumber: "#1001", createdAt: "2025-06-01T15:30:00.000Z", paidAt: "2025-06-01T15:30:00.000Z",
      paymentStatus: "paid", status: "delivered", fulfillmentStatus: "delivered", isTest: false, total: 64.24, subtotal: 48, shipping: 10, tax: 6.24,
      customer: { name: "Ada", email: "ada@example.com" }, reviewRequestedAt: NOW.toISOString(),
      items: [{ id: "past-1", title: "Moth Songs", quantity: 2, price: 20 }, { id: "past-2", title: "Zine", quantity: 1, price: 8 }],
    });
    // Nothing that wakes a payment, shipping or review sweep.
    for (const key of ["shippedAt", "stripePaymentIntentId", "cartId", "trackingKey"]) expect(first).not.toHaveProperty(key);
    expect(db.docs.get(`orders/${pastOrderId("#1002")}`)).toMatchObject({ paymentStatus: "refunded", status: "refunded", refundedAmountMinor: 3000, items: [{ title: "Items from your old shop", quantity: 1, price: 30 }] });
    expect([...db.docs.values()].some((d) => /Brought 2 past orders over .*CA\$94\.24/.test(d.message || ""))).toBe(true);
  });

  it("a re-run adds nothing", async () => {
    const db = fakeDb();
    await importPastOrders(db, ORDERS.slice(0, 2), { now: NOW });
    const before = db.docs.size;
    const again = await importPastOrders(db, ORDERS.slice(0, 2), { now: NOW });
    expect(again.added).toEqual([]);
    expect(again.skipped.map((s) => s.reason)).toEqual(["already brought over", "already brought over"]);
    expect(db.docs.size).toBe(before);
  });

  it("history only: the stockroom never counts it, returns are closed and the packing digest leaves it out", async () => {
    const db = fakeDb();
    await importPastOrders(db, ORDERS.slice(0, 1), { now: NOW });
    const order = db.docs.get(`orders/${pastOrderId("#1001")}`);
    expect(pushKind(order, { startDay: "2020-01-01" })).toBeNull();
    expect(pushKind({ ...order, source: undefined }, { startDay: "2020-01-01" })).toBe("real");
    expect(returnRequestProblem(order, { enabled: true, windowDays: 3650 }, NOW.getTime())).toBe("closed");
    const digest = buildOrderDigest([{ id: "x", ...order }], new Map(), NOW.getTime());
    expect(JSON.stringify(digest)).not.toContain(pastOrderId("#1001"));
  });

  it("the request is checked before anything is written", async () => {
    const db = fakeDb();
    expect((await handlePastOrdersImport({}, { db, actor: "a", now: NOW })).status).toBe(400);
    expect((await handlePastOrdersImport({ orders: Array(501).fill(ORDERS[0]) }, { db, actor: "a", now: NOW })).status).toBe(400);
    expect(db.docs.size).toBe(0);
    expect(await handlePastOrdersImport({ orders: ORDERS.slice(0, 1) }, { db, actor: "a", now: NOW })).toEqual({ status: 200, body: { added: 1, skipped: [] } });
  });
});
