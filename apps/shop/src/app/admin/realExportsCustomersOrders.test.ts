// Customers and past orders from the export files of the common shop systems, run through the same readers the
// Bring customers over and Bring past orders over windows use. The fixtures in fixtures/exports/ copy each system's
// real column headings and value formats (made-up people and addresses only).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { mergePastOrderFiles, readPastOrders, readyToSend, type PastOrder } from "./pastOrders";
import { planCustomerNotes, readCustomerExport } from "./shopMove";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures/exports", name), "utf8");
const NOW = new Date("2026-11-10T12:00:00Z");

describe("customer exports", () => {
  const cases: [string, { place?: string; accepts?: [boolean | null, boolean | null]; orders?: number | null; spent?: number | null; tags?: string[]; note?: string }][] = [
    ["shopify-customers_export.csv", { place: "Toronto, ON, CA", accepts: [true, false], orders: 3, spent: 84.5, tags: ["vip", "zine fan"], note: "Likes poetry" }],
    ["woocommerce-customers.csv", { place: "Toronto, ON, CA", accepts: [null, null], orders: 3, spent: 84.5 }],
    ["squarespace-profiles.csv", { place: "Toronto, ON, CA", accepts: [true, false], orders: 3, spent: 84.5, tags: ["vip"] }],
    ["square-customers.csv", { place: "Toronto, ON", accepts: [true, false], orders: 3, spent: 84.5, tags: ["Regulars", "Fair"], note: "Met at the book fair" }],
    ["wix-contacts.csv", { place: "Toronto, ON, CA", accepts: [true, false], tags: ["Customers", "VIP"] }],
    ["bigcommerce-customers.csv", { accepts: [null, null], note: "Wholesale enquiry" }],
  ];
  for (const [file, want] of cases) {
    it(`reads ${file}`, () => {
      const move = readCustomerExport(fixture(file));
      expect(move.problems).toEqual([]);
      expect(move.skipped).toEqual([]);
      expect(move.customers.map(c => [c.email, c.name])).toEqual([["ada@example.com", "Ada Reader"], ["ben@example.com", "Ben Pages"]]);
      const [ada, ben] = move.customers;
      if (want.place !== undefined) expect(ada.place).toBe(want.place);
      if (want.accepts) expect([ada.acceptsEmail, ben.acceptsEmail]).toEqual(want.accepts);
      if (want.orders !== undefined) expect(ada.orders).toBe(want.orders);
      if (want.spent !== undefined) expect(ada.spent).toBe(want.spent);
      if (want.tags) expect(ada.tags).toEqual(want.tags);
      if (want.note) expect(ada.note).toBe(want.note);
      // A second run of the same file changes nothing.
      const first = planCustomerNotes(move.customers, new Map(), "2026-11-10");
      const saved = new Map(first.map(w => [w.email, { note: w.note, tags: w.tags, name: w.name, place: w.place }]));
      expect(planCustomerNotes(move.customers, saved, "2026-11-11").every(w => w.action === "unchanged")).toBe(true);
    });
  }
});

const byNumber = (orders: PastOrder[]) => Object.fromEntries(orders.map(o => [o.number, o]));
const items = (o: PastOrder) => o.items.map(i => [i.title, i.quantity, i.price]);
const TWO_ITEMS = [["Poems in Blue", 2, 20], ["Zine Two", 1, 10]];

describe("order exports", () => {
  it("reads a one-line-per-item file with an order Id column and keeps the order number", () => {
    const file = readPastOrders(fixture("shopify-orders_export.csv"), NOW);
    expect(file.problems).toEqual([]);
    const o = byNumber(file.orders);
    expect(Object.keys(o)).toEqual(["#1001", "#1002", "#1003"]);
    expect(o["#1001"]).toMatchObject({ email: "ada@example.com", name: "Ada Reader", total: 57.8, subtotal: 50, shipping: 10, tax: 7.8, discount: 10, currency: "CAD", orderedAt: "2025-06-01T19:29:00.000Z" });
    expect(items(o["#1001"])).toEqual(TWO_ITEMS);
    expect(o["#1002"].refunded).toBe(30);
    expect(o["#1003"]).toMatchObject({ refunded: 15, currency: "USD" });
    expect(file.skipped.map(s => s.reason)).toEqual([expect.stringContaining("#1004")]);
    expect(file.foreign).toEqual({ USD: 1 });
  });

  it("reads a store analytics order list (products in one cell, net sales)", () => {
    const file = readPastOrders(fixture("woocommerce-orders.csv"), NOW);
    expect(file.problems).toEqual([]);
    const o = byNumber(file.orders);
    expect(Object.keys(o)).toEqual(["1201", "1202"]);
    expect(o["1201"]).toMatchObject({ name: "Ada Reader", total: 50, orderedAt: expect.stringMatching(/^2025-06-01/) });
    expect(o["1201"].items[0]).toMatchObject({ title: "Poems in Blue, Zine Two", quantity: 3 });
    expect(o["1202"].refunded).toBe(30);
    expect(file.skipped).toHaveLength(2);
  });

  it("reads an orders file with Amount Refunded", () => {
    const file = readPastOrders(fixture("squarespace-orders.csv"), NOW);
    expect(file.problems).toEqual([]);
    const o = byNumber(file.orders);
    expect(Object.keys(o)).toEqual(["00101", "00102"]);
    expect(items(o["00101"])).toEqual(TWO_ITEMS);
    expect(o["00101"]).toMatchObject({ email: "ada@example.com", total: 57.8, shipping: 10, tax: 7.8 });
    expect(o["00102"].refunded).toBe(30);
    expect(file.skipped).toHaveLength(1);
  });

  it("reads an orders file whose items are packed into one cell (name:value pairs)", () => {
    const file = readPastOrders(fixture("bigcartel-orders.csv"), NOW);
    expect(file.problems).toEqual([]);
    const o = byNumber(file.orders);
    expect(Object.keys(o)).toEqual(["BC-1001", "BC-1002"]);
    expect(o["BC-1001"]).toMatchObject({ email: "ada@example.com", name: "Ada Reader", total: 57.8, subtotal: 50, shipping: 10, tax: 7.8, discount: 10 });
    expect(items(o["BC-1001"])).toEqual(TWO_ITEMS);
    expect(o["BC-1002"].refunded).toBe(30);
    expect(file.skipped).toHaveLength(1);
  });

  it("reads the sold-orders and sold-items files, alone and together", () => {
    const orders = readPastOrders(fixture("etsy-EtsySoldOrders.csv"), NOW);
    expect(orders.problems).toEqual([]);
    const o = byNumber(orders.orders);
    expect(o["3012345678"]).toMatchObject({ name: "Ada Reader", total: 62.8, shipping: 10, tax: 7.8, discount: 5, currency: "CAD", orderedAt: "2025-06-01" });
    // A partly refunded order: its adjusted total is what was kept.
    expect(o["3012345679"]).toMatchObject({ total: 30, refunded: 10, currency: "USD", orderedAt: "2025-07-10" });

    const lines = readPastOrders(fixture("etsy-EtsySoldOrderItems.csv"), NOW);
    expect(lines.problems).toEqual([]);
    const l = byNumber(lines.orders);
    expect(items(l["3012345678"])).toEqual(TWO_ITEMS);
    expect(l["3012345678"].total).toBe(62.8); // 50 of items + 10 shipping + 7.80 tax − 5 discount

    const both = mergePastOrderFiles([{ name: "orders.csv", file: orders }, { name: "items.csv", file: lines }]);
    const b = byNumber(both.orders);
    expect(both.orders).toHaveLength(2);
    expect(b["3012345678"].total).toBe(62.8);
    expect(items(b["3012345678"])).toEqual(TWO_ITEMS);
  });

  it("reads an online orders file (Recipient columns, $ amounts)", () => {
    const file = readPastOrders(fixture("square-orders.csv"), NOW);
    expect(file.problems).toEqual([]);
    const o = byNumber(file.orders);
    expect(Object.keys(o)).toEqual(["SQ5001", "SQ5002"]);
    expect(o["SQ5001"]).toMatchObject({ email: "ada@example.com", name: "Ada Reader", total: 57.8, subtotal: 50, shipping: 10, tax: 7.8 });
    expect(items(o["SQ5001"])).toEqual(TWO_ITEMS);
    expect(o["SQ5002"].refunded).toBe(30);
    expect(file.skipped).toHaveLength(1);
  });

  it("reads a point-of-sale transactions file, refund lines included", () => {
    const file = readPastOrders(fixture("square-transactions.csv"), NOW);
    expect(file.problems).toEqual([]);
    const o = byNumber(file.orders);
    expect(Object.keys(o).sort()).toEqual(["TXN1EXAMPLE", "TXN2EXAMPLE"]);
    expect(o["TXN1EXAMPLE"]).toMatchObject({ name: "Ada Reader", total: 45.85, tax: 5.85, discount: 5, refunded: 5, orderedAt: "2025-06-01" });
    expect(o["TXN2EXAMPLE"]).toMatchObject({ total: 30, refunded: 30 });
  });

  it("reads an orders file with a Buyer's email column and 'Not paid' orders", () => {
    const file = readPastOrders(fixture("wix-orders.csv"), NOW);
    expect(file.problems).toEqual([]);
    const o = byNumber(file.orders);
    expect(Object.keys(o)).toEqual(["10001", "10002"]);
    expect(o["10001"]).toMatchObject({ email: "ada@example.com", name: "Ada Reader", total: 57.8, shipping: 10, tax: 7.8, orderedAt: expect.stringMatching(/^2025-06-0[12]/) });
    expect(items(o["10001"])).toEqual(TWO_ITEMS);
    expect(o["10002"].refunded).toBe(30);
    expect(file.skipped).toHaveLength(1);
  });

  it("reads an orders file with day-first dates and packed product details", () => {
    const file = readPastOrders(fixture("bigcommerce-orders.csv"), NOW);
    expect(file.problems).toEqual([]);
    const o = byNumber(file.orders);
    expect(Object.keys(o)).toEqual(["101", "102"]);
    expect(o["101"]).toMatchObject({ email: "ada@example.com", name: "Ada Reader", total: 57.8, subtotal: 50, shipping: 10, tax: 7.8, currency: "CAD", orderedAt: "2025-06-01" });
    expect(o["101"].items.map(i => [i.title, i.quantity, i.price, i.sku])).toEqual([["Poems in Blue", 2, 20, "PB-1"], ["Zine Two", 1, 10, "ZN-2"]]);
    expect(o["102"]).toMatchObject({ refunded: 30, orderedAt: "2025-07-10" });
    expect(file.skipped).toHaveLength(1);
  });

  it("gives every order a steady reference, so a second run adds nothing new", () => {
    for (const name of ["shopify-orders_export.csv", "bigcartel-orders.csv", "square-orders.csv", "wix-orders.csv", "bigcommerce-orders.csv"]) {
      const a = readPastOrders(fixture(name), NOW);
      const b = readPastOrders(fixture(name), NOW);
      expect(a.orders.map(o => o.oldRef)).toEqual(b.orders.map(o => o.oldRef));
      expect(new Set(a.orders.map(o => o.oldRef)).size).toBe(a.orders.length);
      const merged = mergePastOrderFiles([{ name: "a", file: a }, { name: "b", file: b }]);
      expect(merged.orders).toHaveLength(a.orders.length);
      const ready = readyToSend(a, { USD: 1.37 });
      expect(Object.keys(ready.waiting)).toEqual([]);
    }
  });
});

describe("every order file, saved by the server as history only", () => {
  type Doc = Record<string, unknown>;
  const { importPastOrders } = createRequire(import.meta.url)("../../../functions/orderImport.js") as {
    importPastOrders: (db: unknown, orders: unknown[], opts: object) => Promise<{ added: string[]; skipped: { reason: string }[] }>;
  };
  const fakeDb = () => {
    const docs = new Map<string, Doc>();
    return {
      docs,
      collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }), add: async (d: Doc) => { docs.set(`${name}/auto${docs.size}`, d); } }),
      async runTransaction<T>(fn: (tx: unknown) => Promise<T>) {
        return fn({
          get: async (r: { path: string }) => ({ exists: docs.has(r.path), data: () => docs.get(r.path) }),
          create: (r: { path: string }, d: Doc) => { if (docs.has(r.path)) throw new Error("ALREADY_EXISTS"); docs.set(r.path, d); },
          update: () => { throw new Error("no update expected"); },
        });
      },
    };
  };
  const files = ["shopify-orders_export.csv", "woocommerce-orders.csv", "squarespace-orders.csv", "bigcartel-orders.csv", "etsy-EtsySoldOrders.csv",
    "etsy-EtsySoldOrderItems.csv", "square-orders.csv", "square-transactions.csv", "wix-orders.csv", "bigcommerce-orders.csv"];
  for (const name of files) {
    it(`saves ${name} with no stock, email or payment effect, and a second run adds none`, async () => {
      const ready = readyToSend(readPastOrders(fixture(name), NOW), { USD: 1.37 });
      const db = fakeDb();
      const first = await importPastOrders(db, ready.orders, { now: NOW, actor: "test", batch: "run-test-0001" });
      expect(first.skipped).toEqual([]);
      expect(first.added).toHaveLength(ready.orders.length);
      for (const [path, d] of db.docs) {
        if (!path.startsWith("orders/")) continue;
        expect(d).toMatchObject({ source: "import", fulfillmentStatus: "delivered", isTest: false });
        expect(["paid", "refunded"]).toContain(d.paymentStatus);
        for (const k of ["stripePaymentIntentId", "cartId", "shippedAt"]) expect(d).not.toHaveProperty(k);
        expect(d.reviewRequestedAt).toBeTruthy();
      }
      const again = await importPastOrders(db, ready.orders, { now: NOW, actor: "test", batch: "run-test-0002" });
      expect(again.added).toEqual([]);
      expect(again.skipped.every(s => s.reason === "already brought over")).toBe(true);
    });
  }
});
