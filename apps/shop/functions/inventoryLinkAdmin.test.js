import { describe, test, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { fakeDb, fakeStore, resetClock } from "./inventoryLink.fakes.mjs";
const { inventoryLinkAdmin } = createRequire(import.meta.url)("./inventoryLinkAdmin");

const now = new Date("2026-10-11T15:00:00Z");
const deps = (db, store) => ({ db, store, now: () => now, sumNet: async () => 0 });
const state = db => db.docs["systemStatus/inventoryLink"]?.data || {};
beforeEach(() => resetClock());

describe("inventory link admin actions", () => {
  test("check connection saves the answer, including 'not granted yet'", async () => {
    const db = fakeDb({});
    const store = fakeStore();
    store.connected = false;
    const res = await inventoryLinkAdmin(deps(db, store), { op: "check" });
    expect(res.body.connection).toMatchObject({ ok: false, problem: "not-granted" });
    store.connected = true;
    await inventoryLinkAdmin(deps(db, store), { op: "check" });
    expect(state(db).connection.ok).toBe(true);
  });

  test("links are validated against both catalogs and saved whole", async () => {
    const db = fakeDb({
      "books/b1": { title: "The Hound", format: "Paperback" },
      "books/e": { title: "E", format: "Ebook" },
      "systemStatus/inventoryLink": { links: { old: { _: "altrove" } } },
    });
    const res = await inventoryLinkAdmin(deps(db, fakeStore()), { op: "saveLinks", links: { b1: { _: "hound" }, e: { _: "altrove" } } });
    expect(res.status).toBe(200);
    expect(res.body.links).toEqual({ b1: { _: "hound" } });
    expect(res.body.errors[0].reason).toMatch(/E-books/);
    expect(state(db).links).toEqual({ b1: { _: "hound" } }); // the removed "old" link is gone
  });

  test("matches can always be taken away, even while the inventory app can't be reached", async () => {
    const db = fakeDb({
      "books/b1": { title: "The Hound", format: "Paperback" },
      "systemStatus/inventoryLink": { startDay: "2026-10-01", links: { b1: { _: "hound" } } },
    });
    const store = fakeStore();
    store.readCatalog = async () => { throw new Error("PERMISSION_DENIED"); };
    const res = await inventoryLinkAdmin(deps(db, store), { op: "saveLinks", links: {} });
    expect(res.status).toBe(200);
    expect(state(db).links).toEqual({});
    expect(state(db).relinkPending).toBeUndefined();
    // Adding a match still needs the inventory app's book list.
    expect((await inventoryLinkAdmin(deps(db, store), { op: "saveLinks", links: { b1: { _: "hound" } } })).status).toBe(409);
  });

  test("new matches restart sending orders with unmatched copies from the beginning", async () => {
    const db = fakeDb({ "books/b1": { title: "The Hound", format: "Paperback" }, "systemStatus/inventoryLink": { startDay: "2026-10-01", relinkCursor: "O-9" } });
    await inventoryLinkAdmin(deps(db, fakeStore()), { op: "saveLinks", links: { b1: { _: "hound" } } });
    expect(state(db)).toMatchObject({ relinkPending: true, relinkCursor: null });
  });

  test("sales start once, only after the connection works, never on a future day", async () => {
    const db = fakeDb({});
    const store = fakeStore();
    expect((await inventoryLinkAdmin(deps(db, store), { op: "startSales", startDay: "2026-10-01" })).status).toBe(409);
    await inventoryLinkAdmin(deps(db, store), { op: "check" });
    expect((await inventoryLinkAdmin(deps(db, store), { op: "startSales", startDay: "2026-10-12" })).status).toBe(400);
    const res = await inventoryLinkAdmin(deps(db, store), { op: "startSales", startDay: "2026-10-01" });
    expect(res.status).toBe(200);
    expect(state(db)).toMatchObject({ startDay: "2026-10-01" });
    const later = await inventoryLinkAdmin(deps(db, store), { op: "startSales", startDay: "2026-10-05" });
    expect(later.status).toBe(409);
    expect(later.body.error).toMatch(/earlier day/);
    expect(state(db).startDay).toBe("2026-10-01");
  });

  test("the start day can move earlier: the inventory app is told first, then older orders are sent", async () => {
    const db = fakeDb({ "systemStatus/inventoryLink": { startDay: "2026-10-11", connection: { ok: true }, backfill: { from: "2026-10-11", done: true, sent: 0 } } });
    const store = fakeStore();
    store.failPastOrders = true;
    const refused = await inventoryLinkAdmin(deps(db, store), { op: "startSales", startDay: "2026-08-01" });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/nothing changed/);
    expect(state(db).startDay).toBe("2026-10-11");
    store.failPastOrders = false;
    const res = await inventoryLinkAdmin(deps(db, store), { op: "startSales", startDay: "2026-08-01" });
    expect(res.status).toBe(200);
    expect(res.body.changedFrom).toBe("2026-10-11");
    expect(store.pastOrders).toEqual([{ from: "2026-08-01", at: now.toISOString() }]);
    expect(state(db)).toMatchObject({ startDay: "2026-08-01", startDayChangedFrom: "2026-10-11" });
    expect(state(db).backfill).toMatchObject({ from: "2026-08-01" });
  });

  test("automatic stock needs one confirmed apply first; rehearsal lasts a day", async () => {
    const db = fakeDb({ "systemStatus/inventoryLink": {} });
    expect((await inventoryLinkAdmin(deps(db, fakeStore()), { op: "setOptions", autoSync: true })).status).toBe(409);
    await inventoryLinkAdmin(deps(db, fakeStore()), { op: "setOptions", rehearsal: true });
    expect(state(db).rehearsalUntil).toBe("2026-10-12T15:00:00.000Z");
    db.docs["systemStatus/inventoryLink"].data.firstApplyAt = "x";
    expect((await inventoryLinkAdmin(deps(db, fakeStore()), { op: "setOptions", autoSync: true })).status).toBe(200);
  });

  test("status shows what the panel needs and hides the run lease", async () => {
    const db = fakeDb({
      "systemStatus/inventoryLink": { startDay: "2026-10-01", lease: { until: "2026-10-11T15:02:00Z", runId: "r" } },
      "orders/t": { isTest: true, paymentStatus: "paid", paidAt: "2026-09-01T12:00:00Z" },
      "orders/a": { paymentStatus: "paid", paidAt: "2026-09-03T12:00:00Z" },
      "inventoryPushes/a": { delivered: false, unlinkedCount: 1 },
    });
    const res = await inventoryLinkAdmin(deps(db, fakeStore()), { op: "status" });
    expect(res.body).toMatchObject({ earliestPaidDay: "2026-09-03", busy: true, undelivered: 1, unlinkedOrders: 1, today: "2026-10-11" });
    expect(res.body.state.lease).toBeUndefined();
    expect(res.body.serviceAccount).toMatch(/compute@/);
  });

  test("apply needs a preview", async () => {
    expect((await inventoryLinkAdmin(deps(fakeDb({}), fakeStore()), { op: "apply" })).status).toBe(400);
  });
});

describe("new books to match", () => {
  const items = [
    { key: "b1|", bookId: "b1", variantId: null, title: "The Hound", edition: "", inventoryBookId: "hound", inventoryTitle: "The Hound" },
    { key: "b2|", bookId: "b2", variantId: null, title: "Altrove", edition: "", inventoryBookId: "altrove", inventoryTitle: "Altrove" },
  ];
  test("Not these: the pair is left out from now on", async () => {
    const db = fakeDb({ "systemStatus/inventoryLink": { connection: { ok: true }, links: { b9: { _: "other" } }, newMatches: { at: "x", count: 2, items } } });
    expect((await inventoryLinkAdmin(deps(db, fakeStore()), { op: "ignoreMatches", matches: [] })).status).toBe(400);
    await inventoryLinkAdmin(deps(db, fakeStore()), { op: "ignoreMatches", matches: [{ key: "b2|", inventoryBookId: "altrove" }] });
    expect(state(db).ignoredMatches).toEqual({ "b2|": "altrove" });
    expect(state(db).newMatches.items.map(m => m.key)).toEqual(["b1|"]);
    expect(state(db).newMatches.count).toBe(1);
  });
  test("saving matches clears their suggestions", async () => {
    const db = fakeDb({
      "systemStatus/inventoryLink": { connection: { ok: true }, newMatches: { at: "x", count: 2, items } },
      "books/b1": { title: "The Hound", format: "Paperback" }, "books/b2": { title: "Altrove", format: "Paperback" },
    });
    const store = fakeStore();
    store.catalog = [{ id: "hound", title: "The Hound" }, { id: "altrove", title: "Altrove" }];
    await inventoryLinkAdmin(deps(db, store), { op: "saveLinks", links: { b1: { _: "hound" } } });
    expect(state(db).newMatches.items.map(m => m.key)).toEqual(["b2|"]);
  });
});

describe("Match these", () => {
  const item = (key, bookId, variantId, inventoryBookId) => ({ key, bookId, variantId, title: bookId, edition: "", inventoryBookId, inventoryTitle: inventoryBookId });
  const books = { "books/a": { title: "A", variants: [{ id: "v1", name: "Signed" }, { id: "v2", name: "Unsigned" }] }, "books/b": { title: "B", format: "Paperback" }, "books/c": { title: "C", format: "Paperback" } };
  const store = () => { const s = fakeStore(); s.catalog = [{ id: "x", title: "X" }, { id: "hound", title: "Hound" }, { id: "cee", title: "C" }]; return s; };

  test("never replaces a working match with a stale suggestion", async () => {
    const db = fakeDb({ ...books, "systemStatus/inventoryLink": {
      connection: { ok: true }, links: { a: { v1: "x" }, b: { _: "hound" } },
      newMatches: { at: "x", count: 2, items: [item("a|v2", "a", "v2", "hound"), item("c|", "c", null, "cee")] },
    } });
    const res = await inventoryLinkAdmin(deps(db, store()), { op: "acceptMatches", keys: ["a|v2", "c|"] });
    expect(res.status).toBe(200);
    expect(state(db).links).toEqual({ a: { v1: "x" }, b: { _: "hound" }, c: { _: "cee" } });
    expect(res.body.added).toBe(1);
    expect(state(db).newMatches.items).toEqual([]);
  });

  test("keeps matches saved elsewhere since this page loaded", async () => {
    const db = fakeDb({ ...books, "systemStatus/inventoryLink": {
      connection: { ok: true }, links: { a: { v1: "x" }, b: { _: "hound" } },
      newMatches: { at: "x", count: 1, items: [item("c|", "c", null, "cee")] },
    } });
    await inventoryLinkAdmin(deps(db, store()), { op: "acceptMatches", keys: ["c|"] });
    expect(state(db).links.b).toEqual({ _: "hound" });
  });

  test("unmatching all clears the suggestions", async () => {
    const db = fakeDb({ ...books, "systemStatus/inventoryLink": { connection: { ok: true }, links: { b: { _: "hound" } }, newMatches: { at: "x", count: 1, items: [item("c|", "c", null, "cee")] } } });
    await inventoryLinkAdmin(deps(db, store()), { op: "saveLinks", links: {} });
    expect(state(db).newMatches).toMatchObject({ items: [], count: 0 });
  });
});
