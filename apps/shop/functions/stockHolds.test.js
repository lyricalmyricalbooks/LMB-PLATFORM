import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
const { activeHolds, heldUnits, linesByBook, reserveStock, StockHoldError, HOLD_MS, holdOwner } = createRequire(import.meta.url)("./stockHolds");

test("expired holds and the order's own hold don't count", () => {
  const holds = { a: { lines: { _: 2 }, expiresAt: 100 }, b: { lines: { _: 1 }, expiresAt: 50 }, me: { lines: { _: 5 }, expiresAt: 999 } };
  const active = activeHolds(holds, 60, "me");
  expect(Object.keys(active)).toEqual(["a"]);
  expect(heldUnits(active, "_")).toBe(2);
});

test("lines are grouped per book and edition with checkout's quantity clamp", () => {
  const m = linesByBook([{ id: "b1", quantity: 2 }, { id: "b1", variantId: "hc", quantity: 500 }, { id: "b1", quantity: 1 }]);
  expect(m.get("b1")).toEqual({ _: 3, hc: 99 });
});

// Minimal in-memory Firestore for the transaction.
function fakeDb(docs) {
  const ref = (col, id) => ({ path: `${col}/${id}` });
  return {
    docs,
    collection: col => ({ doc: id => ref(col, id) }),
    _transactionTail: Promise.resolve(),
    runTransaction: async function (fn) {
      const next = this._transactionTail.then(() => fn({
        get: async r => ({ exists: r.path in docs, data: () => docs[r.path] }),
        set: (r, data) => { docs[r.path] = data; },
      }));
      this._transactionTail = next.catch(() => {});
      return next;
    },
  };
}

test("a second shopper can't hold the last copy", async () => {
  const db = fakeDb({ "books/b1": { title: "Zine", trackInventory: true, stockLevel: 1 } });
  await reserveStock(db, "o1", [{ id: "b1", quantity: 1 }], 1000);
  await expect(reserveStock(db, "o2", [{ id: "b1", quantity: 1 }], 1001)).rejects.toBeInstanceOf(StockHoldError);
  // The first shopper renewing their own hold is fine.
  await reserveStock(db, "o1", [{ id: "b1", quantity: 1 }], 1002);
  // After the hold expires, the copy is free again.
  await reserveStock(db, "o2", [{ id: "b1", quantity: 1 }], 1002 + HOLD_MS + 1);
  expect(Object.keys(db.docs["stock-holds/b1"].holds)).toEqual(["o2"]);
});

test("simultaneous last-copy checkouts serialize so only one gets the hold", async () => {
  const db = fakeDb({ "books/b1": { title: "Zine", trackInventory: true, stockLevel: 1 } });
  const results = await Promise.allSettled([
    reserveStock(db, "o1", [{ id: "b1", quantity: 1 }], 1000),
    reserveStock(db, "o2", [{ id: "b1", quantity: 1 }], 1000),
  ]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
});

test("a failed reservation transaction fails closed", async () => {
  const db = { runTransaction: async () => { throw new Error("Firestore unavailable"); } };
  await expect(reserveStock(db, "o1", [{ id: "b1", quantity: 1 }], 1000)).rejects.toThrow("Firestore unavailable");
});

test("untracked and backorder books are never held", async () => {
  const db = fakeDb({ "books/b1": { title: "Ebook", trackInventory: false, stockLevel: 0 } });
  await reserveStock(db, "o1", [{ id: "b1", quantity: 3 }], 1);
  expect(db.docs["stock-holds/b1"]).toBeUndefined();
});

test("a shopper's own earlier order doesn't lock them out of the last copy, but still blocks others", async () => {
  const db = fakeDb({ "books/b1": { title: "Zine", trackInventory: true, stockLevel: 1 } });
  const ada = holdOwner({ customer: { email: " Ada@Example.com " } });
  expect(ada).toBe(holdOwner({ customer: { email: "ada@example.com" } }));
  expect(ada).not.toContain("@");
  expect(holdOwner({})).toBe("");
  await reserveStock(db, "first", [{ id: "b1", quantity: 1 }], 1000, ada);
  // Card declined, Ada fixes a typo: a new order for the same copy.
  await expect(reserveStock(db, "retry", [{ id: "b1", quantity: 1 }], 2000, ada)).resolves.toBeUndefined();
  // Someone else still can't take it, and an anonymous order is never treated as Ada's.
  const bob = holdOwner({ customer: { email: "bob@example.com" } });
  await expect(reserveStock(db, "bob", [{ id: "b1", quantity: 1 }], 3000, bob)).rejects.toBeInstanceOf(StockHoldError);
  await expect(reserveStock(db, "anon", [{ id: "b1", quantity: 1 }], 3000, "")).rejects.toBeInstanceOf(StockHoldError);
});

test("a shopper's retry replaces their earlier hold, so another paid shopper still settles", async () => {
  const now = Date.now();
  const db = fakeDb({ "books/b1": { title: "Zine", trackInventory: true, stockLevel: 2 } });
  const ada = holdOwner({ customer: { email: "ada@example.com" } }), bob = holdOwner({ customer: { email: "bob@example.com" } });
  await reserveStock(db, "ada1", [{ id: "b1", quantity: 1 }], now, ada);
  await reserveStock(db, "bob1", [{ id: "b1", quantity: 1 }], now, bob);
  await reserveStock(db, "ada2", [{ id: "b1", quantity: 1 }], now, ada);
  expect(Object.keys(db.docs["stock-holds/b1"].holds).sort()).toEqual(["ada2", "bob1"]);
  db.docs["books/b1"].stockLevel = 1; // Ada paid ada2
  delete db.docs["stock-holds/b1"].holds.ada2;
  await expect(reserveStock(db, "bob1", [{ id: "b1", quantity: 1 }], now + 1, bob)).resolves.toBeUndefined();
});

// Per-shopper caps (HOLD_LIMITS): a script can't lock the catalogue by opening unpaid checkouts.
describe("per-shopper hold caps", () => {
  const { HOLD_LIMITS, HoldLimitError, releaseStock, holderLimitProblem } = createRequire(import.meta.url)("./stockHolds");
  const books = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`books/b${i}`, { title: `Book ${i}`, trackInventory: true, stockLevel: 500 }]));
  const ada = holdOwner({ customer: { email: "ada@example.com" } });

  test("one shopper can't hold more than the per-book cap of a scarce book", async () => {
    const db = fakeDb(books(1));
    const err = await reserveStock(db, "o1", [{ id: "b0", quantity: HOLD_LIMITS.owner.perBook + 1 }], 1000, ada, { limits: true }).catch(e => e);
    expect(err).toBeInstanceOf(HoldLimitError);
    expect(err).toBeInstanceOf(StockHoldError); // existing 409 handling covers it
    expect(err.code).toBe("hold_limit");
    expect(db.docs["stock-holds/b0"]).toBeUndefined();
    await expect(reserveStock(db, "o1", [{ id: "b0", quantity: HOLD_LIMITS.owner.perBook }], 1000, ada, { limits: true })).resolves.toBeUndefined();
  });

  test("one shopper can't keep more than the cap of unpaid checkouts open at once", async () => {
    const db = fakeDb(books(10));
    for (let i = 0; i < HOLD_LIMITS.owner.orders; i++) {
      await reserveStock(db, `o${i}`, [{ id: `b${i}`, quantity: 1 }], 1000, ada, { limits: true });
    }
    await expect(reserveStock(db, "extra", [{ id: "b9", quantity: 1 }], 1000, ada, { limits: true })).rejects.toBeInstanceOf(HoldLimitError);
    // Once those holds expire the shopper can check out again.
    await expect(reserveStock(db, "extra", [{ id: "b9", quantity: 1 }], 1000 + HOLD_MS + 1, ada, { limits: true })).resolves.toBeUndefined();
  });

  test("a total-units cap applies across one shopper's checkouts", () => {
    const limits = { perBook: 10, units: 15, orders: 5 };
    expect(holderLimitProblem({ a: { books: { x: 10 } } }, { y: 5 }, limits)).toBe("");
    expect(holderLimitProblem({ a: { books: { x: 10 } } }, { y: 6 }, limits)).toBe("units");
    expect(holderLimitProblem({ a: { books: { x: 6 } } }, { x: 5 }, limits)).toBe("perBook");
  });

  test("a shopper's own retries replace their earlier attempt instead of counting against the cap", async () => {
    const db = fakeDb(books(2));
    for (let i = 0; i < HOLD_LIMITS.owner.orders + 3; i++) {
      await expect(reserveStock(db, `retry${i}`, [{ id: "b0", quantity: HOLD_LIMITS.owner.perBook }], 1000 + i, ada, { limits: true })).resolves.toBeUndefined();
    }
    expect(Object.keys(db.docs[`stock-hold-owners/e_${ada}`].orders)).toEqual([`retry${HOLD_LIMITS.owner.orders + 2}`]);
  });

  test("different emails from one connection share the looser connection cap", async () => {
    const db = fakeDb(books(1));
    const ip = "203.0.113.9";
    let held = 0, i = 0;
    while (held + 5 <= HOLD_LIMITS.ip.perBook) {
      const owner = holdOwner({ customer: { email: `bot${i}@example.com` } });
      await reserveStock(db, `bot${i++}`, [{ id: "b0", quantity: 5 }], 1000, owner, { limits: true, ip });
      held += 5;
    }
    const owner = holdOwner({ customer: { email: "bot-next@example.com" } });
    await expect(reserveStock(db, "bot-next", [{ id: "b0", quantity: 5 }], 1000, owner, { limits: true, ip })).rejects.toBeInstanceOf(HoldLimitError);
    // The raw address is never stored.
    expect(JSON.stringify(db.docs)).not.toContain(ip);
  });

  test("releasing an order frees its place in the shopper's count", async () => {
    const db = fakeDb(books(10));
    const now = Date.now();
    for (let i = 0; i < HOLD_LIMITS.owner.orders; i++) {
      await reserveStock(db, `o${i}`, [{ id: `b${i}`, quantity: 1 }], now, ada, { limits: true });
    }
    await releaseStock(db, "o0", [{ id: "b0", quantity: 1 }]);
    expect(Object.keys(db.docs[`stock-hold-owners/e_${ada}`].orders)).not.toContain("o0");
    await expect(reserveStock(db, "o9", [{ id: "b9", quantity: 1 }], now, ada, { limits: true })).resolves.toBeUndefined();
  });

  test("payment-time renewals and untracked books are never capped", async () => {
    const db = fakeDb({ ...books(1), "books/e": { title: "Ebook", trackInventory: false } });
    await expect(reserveStock(db, "paid", [{ id: "b0", quantity: 40 }], 1000, ada)).resolves.toBeUndefined();
    await expect(reserveStock(db, "ebook", [{ id: "e", quantity: 99 }], 1000, ada, { limits: true })).resolves.toBeUndefined();
  });

  test("#43 a payment-time renewal keeps the order's holders, so releasing it frees the shopper's cap", async () => {
    const db = fakeDb(books(2));
    const now = Date.now();
    const ip = "203.0.113.9";
    await reserveStock(db, "paid1", [{ id: "b0", quantity: 2 }], now, ada, { limits: true, ip });
    // Paying renews the hold with no limits (markStripeOrderPaid), then the hold is released.
    await reserveStock(db, "paid1", [{ id: "b0", quantity: 2 }], now + 1000, ada);
    expect(db.docs["stock-holds/b0"].holds.paid1.holders).toHaveLength(2);
    await releaseStock(db, "paid1", [{ id: "b0", quantity: 2 }]);
    expect(Object.keys(db.docs[`stock-hold-owners/e_${ada}`].orders)).toEqual([]);
    const ipDoc = Object.entries(db.docs).find(([k]) => k.startsWith("stock-hold-owners/ip_"));
    expect(Object.keys(ipDoc[1].orders)).toEqual([]);
  });

  test("#44 every address in one IPv6 /64 shares one connection bucket", async () => {
    const db = fakeDb(books(1));
    let held = 0, i = 0;
    while (held + 5 <= HOLD_LIMITS.ip.perBook) {
      const owner = holdOwner({ customer: { email: `v6bot${i}@example.com` } });
      await reserveStock(db, `v6bot${i}`, [{ id: "b0", quantity: 5 }], 1000, owner, { limits: true, ip: `2001:db8:1:2:${i.toString(16)}:aaaa::${i + 1}` });
      held += 5; i++;
    }
    const owner = holdOwner({ customer: { email: "v6next@example.com" } });
    await expect(reserveStock(db, "v6next", [{ id: "b0", quantity: 5 }], 1000, owner, { limits: true, ip: "2001:db8:1:2:ffff::1" })).rejects.toBeInstanceOf(HoldLimitError);
  });

  test("#45 the owner's saved caps replace the defaults, and bad values fall back", async () => {
    const { holdLimitsFrom } = createRequire(import.meta.url)("./stockHolds");
    expect(holdLimitsFrom({}).owner).toEqual(HOLD_LIMITS.owner);
    const raised = holdLimitsFrom({ stockHolds: { perBook: 40, units: 200, orders: 5 } });
    expect(raised.owner).toEqual({ perBook: 40, units: 200, orders: 5 });
    expect(raised.ip.perBook).toBeGreaterThanOrEqual(80);
    expect(holdLimitsFrom({ stockHolds: { perBook: "x", units: -3, orders: 0 } }).owner).toEqual(HOLD_LIMITS.owner);
    const db = fakeDb(books(1));
    const big = [{ id: "b0", quantity: HOLD_LIMITS.owner.perBook + 5 }];
    await expect(reserveStock(db, "big1", big, 1000, ada, { limits: true })).rejects.toBeInstanceOf(HoldLimitError);
    await expect(reserveStock(db, "big2", big, 1000, ada, { limits: true, holdLimits: raised })).resolves.toBeUndefined();
  });
});
