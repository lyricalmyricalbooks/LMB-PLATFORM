// Past orders brought over from the old shop (plan 23.7): history only. No stock, no email, no payment; a re-run adds none.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importPastOrders, handlePastOrdersImport, handlePastOrdersRemove, pastOrderId } = require("./orderImport.js");
const { averageRates, handleExchangeRates } = require("./pastOrderRates.js");
const { pushKind } = require("./inventoryLink.js");
const { returnRequestProblem } = require("./shared/returnRequests.js");
const { buildOrderDigest } = require("./orderDigest.js");

/** A pretend Firestore whose create() refuses a document that exists, as the real one does. */
function fakeDb() {
  const docs = new Map();
  const query = (name, field, value, n = Infinity) => ({
    limit: (k) => query(name, field, value, k),
    get: async () => ({ docs: [...docs].filter(([p, d]) => p.startsWith(`${name}/`) && d[field] === value).slice(0, n).map(([p, d]) => ({ ref: { path: p }, data: () => d })) }),
  });
  return {
    docs,
    collection: (name) => ({
      doc: (id) => ({ path: `${name}/${id}` }), add: async (data) => { docs.set(`${name}/auto${docs.size}`, data); },
      where: (field, _op, value) => query(name, field, value),
    }),
    batch: () => { const gone = []; return { delete: (r) => gone.push(r.path), commit: async () => gone.forEach((p) => docs.delete(p)) }; },
    async runTransaction(fn) {
      const writes = [];
      const out = await fn({
        get: async (r) => ({ exists: docs.has(r.path), data: () => docs.get(r.path) }),
        create: (r, d) => writes.push([r.path, d, "create"]), update: (r, d) => writes.push([r.path, d, "update"]),
      });
      for (const [path, d, how] of writes) {
        if (how === "create" && docs.has(path)) throw new Error("ALREADY_EXISTS");
        if (how === "update" && !docs.has(path)) throw new Error("NOT_FOUND");
        docs.set(path, how === "update" ? { ...docs.get(path), ...d } : d);
      }
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
  { oldRef: "#1006", orderedAt: "2025-07-02", total: 42, currency: "CAD", paidIn: { currency: "USD", total: 30, rate: 1.4 } },
  { oldRef: "#1007", orderedAt: "2025-07-02", total: 42, paidIn: { currency: "CAD", total: 30, rate: 1.4 } },
];

describe("bringing past orders over (plan 23.7)", () => {
  it("each becomes a paid, delivered past order for the reports and the customer's history, or says why not", async () => {
    const db = fakeDb();
    const { added, skipped } = await importPastOrders(db, ORDERS, { actor: "owner@example.com", now: NOW });
    expect(added).toEqual([pastOrderId("#1001"), pastOrderId("#1002"), pastOrderId("#1006")]);
    expect(skipped.map((s) => s.reason)).toEqual(["in USD, and this shop sells in Canadian dollars", "its date couldn't be read", "its date is in the future", "nothing to tell it apart", "its other currency couldn't be read"]);
    expect(db.docs.get(`orders/${pastOrderId("#1006")}`)).toMatchObject({ total: 42, paidIn: { currency: "USD", total: 30, rate: 1.4 } });
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
    expect([...db.docs.values()].some((d) => /Brought 3 past orders over .*CA\$136\.24/.test(d.message || ""))).toBe(true);
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

  it("a new rate changes only the money of foreign-currency orders it brought over, in one step (plan 23.23)", async () => {
    const db = fakeDb();
    const usd = (rate) => ({ oldRef: "#2001", orderedAt: "2025-07-02", currency: "CAD", items: [{ title: "Hoodie", quantity: 1, price: 30 * rate }],
      subtotal: 30 * rate, total: 30 * rate, refunded: 10 * rate, paidIn: { currency: "USD", total: 30, rate } });
    const cad = ORDERS[0];
    await importPastOrders(db, [usd(1.37), cad], { now: NOW, batch: "run-first-one" });
    const id = `orders/${pastOrderId("#2001")}`;
    // Without asking, a re-run still changes nothing.
    expect((await importPastOrders(db, [usd(1.4)], { now: NOW })).skipped).toEqual([{ oldRef: "#2001", reason: "already brought over" }]);
    expect(db.docs.get(id).total).toBe(41.1);
    const later = new Date("2026-11-04T12:00:00Z");
    const again = await importPastOrders(db, [usd(1.4), cad], { now: later, actor: "owner@example.com", rerate: true, batch: "run-second-one" });
    expect(again.added).toEqual([]);
    expect(again.rerated).toEqual([pastOrderId("#2001")]);
    // A Canadian-dollar order has no rate to change.
    expect(again.skipped).toEqual([{ oldRef: "#1001", reason: "already brought over" }]);
    const order = db.docs.get(id);
    expect(order).toMatchObject({ total: 42, subtotal: 42, refundedAmountMinor: 1400, paidIn: { currency: "USD", total: 30, rate: 1.4 }, items: [{ price: 42 }],
      importBatch: "run-first-one", createdAt: "2025-07-02T12:00:00.000Z", updatedAt: later.toISOString(), source: "import" });
    expect(order.activity.map((a) => a.type)).toEqual(["imported", "rerated"]);
    expect([...db.docs.values()].some((d) => /Changed the rate on 1 past order/.test(d.message || ""))).toBe(true);
    // The same rate again, a different amount, or an order this server didn't bring over: left alone.
    expect((await importPastOrders(db, [usd(1.4)], { now: NOW, rerate: true })).rerated).toEqual([]);
    expect((await importPastOrders(db, [{ ...usd(1.5), paidIn: { currency: "USD", total: 31, rate: 1.5 } }], { now: NOW, rerate: true })).rerated).toEqual([]);
    db.docs.set(id, { ...db.docs.get(id), source: "web" });
    expect((await importPastOrders(db, [usd(1.5)], { now: NOW, rerate: true })).rerated).toEqual([]);
    expect(db.docs.get(id).total).toBe(42);
    const answer = await handlePastOrdersImport({ orders: [usd(1.5)], rerate: "yes" }, { db, actor: "a", now: NOW });
    expect(answer.body).toMatchObject({ added: 0, rerated: 0 });
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
    expect(await handlePastOrdersImport({ orders: ORDERS.slice(0, 1), batch: "run-cccc3333" }, { db, actor: "a", now: NOW })).toEqual({ status: 200, body: { added: 1, rerated: 0, skipped: [] } });
    expect(db.docs.get(`orders/${pastOrderId("#1001")}`).importBatch).toBe("run-cccc3333");
  });
});

describe("taking a run back (plan 23.15)", () => {
  it("removes only the orders that run added, a few hundred at a time, and says so in the audit log", async () => {
    const db = fakeDb();
    await handlePastOrdersImport({ orders: ORDERS.slice(0, 2), batch: "run-aaaa1111" }, { db, actor: "a", now: NOW });
    await handlePastOrdersImport({ orders: [{ oldRef: "#2001", orderedAt: "2025-01-01", total: 5 }], batch: "run-bbbb2222" }, { db, actor: "a", now: NOW });
    db.docs.set("orders/real", { source: "web", importBatch: "run-aaaa1111", total: 9 }); // not brought over: never removed
    expect((await handlePastOrdersRemove({ batch: "x" }, { db, actor: "a", now: NOW })).status).toBe(400);
    const out = await handlePastOrdersRemove({ batch: "run-aaaa1111" }, { db, actor: "a", now: NOW });
    expect(out).toEqual({ status: 200, body: { removed: 2, more: false } });
    expect(db.docs.has(`orders/${pastOrderId("#1001")}`)).toBe(false);
    expect(db.docs.has(`orders/${pastOrderId("#2001")}`)).toBe(true);
    expect(db.docs.has("orders/real")).toBe(true);
    expect([...db.docs.values()].some((d) => /Removed 2 past orders/.test(d.message || ""))).toBe(true);
    // Brought over again afterwards, they come back.
    expect((await handlePastOrdersImport({ orders: ORDERS.slice(0, 2) }, { db, actor: "a", now: NOW })).body.added).toBe(2);
  });
});

describe("a suggested rate for other currencies (plan 23.14)", () => {
  const bank = { observations: [{ d: "2025-06-02", FXUSDCAD: { v: "1.3707" }, FXEURCAD: { v: "1.5663" } }, { d: "2025-06-03", FXUSDCAD: { v: "1.3721" }, FXEURCAD: { v: "bad" } }] };
  it("averages the Bank of Canada's daily rates over the file's dates, for the currencies it publishes", async () => {
    const asked = [];
    const out = await averageRates({ currencies: ["USD", "EUR", "XYZ"], from: "2025-06-01", to: "2025-06-05" }, { getJson: async (u) => { asked.push(u); return bank; } });
    expect(out.rates).toEqual({ USD: 1.3714, EUR: 1.5663 });
    expect(asked).toEqual(["https://www.bankofcanada.ca/valet/observations/FXUSDCAD,FXEURCAD/json?start_date=2025-06-01&end_date=2025-06-05"]);
    expect((await averageRates({ currencies: ["XYZ"], from: "2025-06-01", to: "2025-06-05" }, { getJson: async () => { throw new Error("no call"); } })).rates).toEqual({});
  });
  it("checks the request before asking, and never asks past today", async () => {
    const getJson = async (u) => { expect(u).toContain("end_date=2026-11-03"); return bank; };
    const allow = async () => true;
    expect((await handleExchangeRates({ currencies: ["USD"], from: "2025-06-05", to: "2025-06-01" }, { allow, getJson, now: NOW })).status).toBe(400);
    expect((await handleExchangeRates({ currencies: ["USD"], from: "1990-01-01", to: "2025-06-01" }, { allow, getJson, now: NOW })).status).toBe(400);
    expect((await handleExchangeRates({ currencies: ["USD"], from: "2026-10-01", to: "2027-01-01" }, { allow: async () => false, getJson, now: NOW })).status).toBe(429);
    expect((await handleExchangeRates({ currencies: ["USD"], from: "2026-10-01", to: "2027-01-01" }, { allow, getJson, now: NOW })).body.rates.USD).toBe(1.3714);
  });
});
