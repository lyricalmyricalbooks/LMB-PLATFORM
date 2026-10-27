// One to-do list and new books (docs/INVENTORY_LINK.md › One to-do list and new books).
import { describe, test, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { fakeDb, fakeStore, resetClock } from "./inventoryLink.fakes.mjs";
const require = createRequire(import.meta.url);
const link = require("./inventoryLink");
const jobs = require("./inventoryLinkJobs");
const { inventoryLinkAdmin } = require("./inventoryLinkAdmin");

let now = new Date("2026-10-25T15:00:00Z");
const deps = (db, store) => ({ db, store, now: () => now, sumNet: async () => 0, adminUrl: "https://shop.example/admin" });
const STATE = { links: { b1: { _: "hound" } }, connection: { ok: true } };
// A held stock change the owner must clear (automatic stock on), for the to-do test.
const HELD = { autoSync: true, lastSync: { holds: [{ bookId: "b1", hold: "big-change" }, { bookId: "b1", hold: "untracked" }] } };
const stateOf = db => db.docs["systemStatus/inventoryLink"].data;
beforeEach(() => { resetClock(); now = new Date("2026-10-25T15:00:00Z"); });

const BOOKS = [
  { id: "b1", title: "The Hound", retailPrice: 65 },
  { id: "b2", title: "Moth Hours", subtitle: "Ana Ruiz", isbn: "", retailPrice: 40, status: "draft",
    photos: [{ url: "https://x/m.jpg", srcset: "https://x/m-480w.webp 480w, https://x/m-240w.webp 240w" }] },
  { id: "b3", title: "Signed set", variants: [{ id: "s", name: "Signed", price: 90 }, { id: "e", name: "E-book", format: "E-book", price: 10 }] },
  { id: "b4", title: "Gone", status: "archived" },
  { id: "b5", title: "Altrove", isbn: "9781234567897" },
];
const APP = [{ id: "hound", title: "The Hound" }, { id: "altrove", title: "Altrove", isbn: "978-1-23456-789-7" },
  { id: "zine", title: "Fair Zine", author: "Lyricalmyrical", price: 12, currency: "CA$" }];

describe("book lists", () => {
  test("website books the app doesn't have: printed, unmatched, not archived, not a suggestion, not dismissed", () => {
    const list = link.shopBooksForApp(BOOKS, APP, STATE.links, { dismissed: { "b3|s": "2026-10-20" }, now: now.getTime() });
    expect(list.map(b => b.key)).toEqual(["b2|"]);
    expect(list[0]).toMatchObject({ title: "Moth Hours", author: "Ana Ruiz", price: 40, status: "draft", cover: "https://x/m-240w.webp" });
    expect(link.shopBooksForApp(BOOKS, APP, STATE.links, { now: now.getTime() }).map(b => b.key)).toEqual(["b2|", "b3|s"]);
    // A suggestion the owner said "Not these" to is offered as a book to add instead.
    expect(link.shopBooksForApp(BOOKS, APP, STATE.links, { ignoredMatches: { "b5|": "altrove" } }).map(b => b.key)).toContain("b5|");
  });
  test("app books the shop doesn't have: unmatched, not a suggestion, not marked Not for the shop", () => {
    expect(link.appBooksForShop(BOOKS, APP, STATE.links)).toEqual([{ id: "zine", title: "Fair Zine", author: "Lyricalmyrical", isbn: "", price: 12, currency: "CA$" }]);
    expect(link.appBooksForShop(BOOKS, APP, STATE.links, { ignoredAppBooks: { zine: "x" } })).toEqual([]);
  });
});

describe("link requests", () => {
  test("links an unmatched printed edition to an unused app book, once", () => {
    const plan = link.linkRequestPlan({ requests: { "b2|": { inventoryBookId: "zine" } }, links: STATE.links, books: BOOKS, appBookIds: APP.map(b => b.id), now });
    expect(plan.adds).toEqual([{ key: "b2|", bookId: "b2", variantId: null, inventoryBookId: "zine" }]);
    expect(plan.replies["b2|"]).toMatchObject({ result: "linked", inventoryBookId: "zine" });
    const again = link.linkRequestPlan({ requests: { "b2|": { inventoryBookId: "zine" } }, replies: plan.replies, links: STATE.links, books: BOOKS, appBookIds: ["zine"], now });
    expect(again).toEqual({ adds: [], replies: {} });
  });
  test("refuses matched editions, app books in use, archived and e-book editions; waits for a book the catalog can't see", () => {
    const plan = link.linkRequestPlan({
      requests: { "b1|": { inventoryBookId: "zine" }, "b2|": { inventoryBookId: "hound" }, "b4|": { inventoryBookId: "zine" },
        "b3|e": { inventoryBookId: "zine" }, "b3|s": { inventoryBookId: "new-one" }, "b9|": { inventoryBookId: "bad id!" } },
      links: STATE.links, books: BOOKS, appBookIds: APP.map(b => b.id), now,
    });
    expect(plan.adds).toEqual([]);
    expect(Object.fromEntries(Object.entries(plan.replies).map(([k, r]) => [k, r.result]))).toEqual({ "b1|": "refused", "b2|": "refused", "b4|": "refused", "b3|e": "refused" });
  });
  test("old answers are dropped after 30 days", () => {
    const kept = link.keptReplies({ a: { at: "2026-10-20T00:00:00Z" }, b: { at: "2026-09-01T00:00:00Z" } }, now);
    expect(Object.keys(kept)).toEqual(["a"]);
  });
});

describe("to-do items", () => {
  test("the website's items name books, not editions, and point at Inventory app link", () => {
    const todo = link.websiteTodo({ holds: [{ bookId: "b1" }, { bookId: "b1", variantId: "x" }], newMatches: 1, appOnly: 3, adminUrl: "https://shop.example/admin/", now });
    expect(todo.items).toEqual([
      { id: "stock-held", count: 1, title: "Stock for 1 book waits for your OK on the website", href: "https://shop.example/admin#inventory/link" },
      { id: "new-matches", count: 1, title: "1 website book looks like a book in this app. Match it on the website", href: "https://shop.example/admin#inventory/link" },
      { id: "app-books", count: 3, title: "3 books here aren't in the shop yet", href: "https://shop.example/admin#inventory/link" },
    ]);
    expect(link.websiteTodo({ adminUrl: "x", now }).items).toEqual([]);
  });
  test("the app's items are cleaned: text only, safe hash, at most ten", () => {
    const clean = link.cleanAppTodo({ at: "2026-10-25T14:00:00Z", items: [
      { id: "needs-you", count: 2, title: "2 website orders need your decision", hash: "#website-orders" },
      { id: "x", count: "3", title: "Bad hash", hash: "javascript:alert(1)" },
      { id: "", title: "no id" },
      ...Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, title: `Item ${i}`, hash: "#todo" })),
    ] });
    expect(clean.items[0]).toEqual({ id: "needs-you", count: 2, title: "2 website orders need your decision", hash: "#website-orders" });
    expect(clean.items[1]).toMatchObject({ hash: "#todo", count: 3 });
    expect(clean.items.length).toBeLessThanOrEqual(10);
    expect(link.cleanAppTodo(null)).toEqual({ at: null, items: [] });
  });
});

describe("runSweep", () => {
  const seed = (extra = {}) => fakeDb({
    "systemStatus/inventoryLink": { ...STATE, ...extra },
    ...Object.fromEntries(BOOKS.map(({ id, ...b }) => [`books/${id}`, b])),
  });
  test("applies the app's Add to the app request, answers it, publishes both lists and the website's to-do", async () => {
    const db = seed();
    const store = fakeStore();
    store.catalog = APP;
    store.appDoc = { todo: { at: "2026-10-25T14:00:00Z", items: [{ id: "needs-you", count: 2, title: "2 website orders need your decision", hash: "#website-orders" }] },
      linkRequests: { "b2|": { inventoryBookId: "zine", at: "2026-10-25T14:59:00Z" } }, dismissedShopBooks: { "b3|s": "2026-10-20T00:00:00Z" } };
    await jobs.runSweep(deps(db, store));
    const state = stateOf(db);
    expect(state.links).toEqual({ b1: { _: "hound" }, b2: { _: "zine" } });
    expect(state.app.todo.items).toEqual([{ id: "needs-you", count: 2, title: "2 website orders need your decision", hash: "#website-orders" }]);
    expect(state.appLinkReplies["b2|"]).toMatchObject({ result: "linked", inventoryBookId: "zine" });
    expect(store.websiteSide.linkReplies["b2|"].result).toBe("linked");
    // The app's own books are all matched now; the website's to-do has nothing for the app.
    expect(state.appOnlyBooks.items).toEqual([]);
    expect(store.websiteSide.todo.items.map(i => i.id)).toEqual(["new-matches"]);
    // The catalog for the app lists the website book it still lacks, minus the dismissed one and the suggestion.
    expect(store.shopCatalog.books.map(b => b.key)).toEqual([]);

    // Nothing changed: no second write to the inventory project.
    now = new Date(now.getTime() + 6 * 60 * 1000);
    await jobs.runSweep(deps(db, store));
    expect(store.websiteSideWrites).toBe(1);
  });
  test("an app book with no website book is offered here and counted on the app's to-do", async () => {
    const db = seed();
    const store = fakeStore();
    store.catalog = APP;
    await jobs.runSweep(deps(db, store));
    expect(stateOf(db).appOnlyBooks.items.map(b => b.id)).toEqual(["zine"]);
    expect(store.websiteSide.todo.items.find(i => i.id === "app-books")).toMatchObject({ count: 1 });
    expect(store.shopCatalog.books.map(b => b.key)).toEqual(["b2|", "b3|s"]);
  });
  test("stock held for the owner reaches the app's to-do; holds that clear themselves don't", async () => {
    const db = seed(HELD);
    const store = fakeStore();
    store.catalog = APP;
    await jobs.runSweep(deps(db, store));
    expect(store.websiteSide.todo.items.find(i => i.id === "stock-held")).toMatchObject({ count: 1, href: "https://shop.example/admin#inventory/link" });
    const quiet = seed({ ...HELD, autoSync: false });
    const store2 = fakeStore();
    store2.catalog = APP;
    await jobs.runSweep(deps(quiet, store2));
    expect(store2.websiteSide.todo.items.find(i => i.id === "stock-held")).toBeUndefined();
  });
  test("a new match during a run that also finishes a relink keeps orders being sent again", async () => {
    const db = seed({ startDay: "2026-10-01", backfill: { done: true }, relinkPending: true, lastCatchUpAt: "2026-10-25T14:55:00Z" });
    const store = fakeStore();
    store.catalog = APP;
    store.appDoc = { linkRequests: { "b2|": { inventoryBookId: "zine" } } };
    await jobs.runSweep(deps(db, store));
    expect(stateOf(db).links.b2).toEqual({ _: "zine" });
    expect(stateOf(db).relinkPending).toBe(true);
  });
});

describe("admin: Add to the shop", () => {
  test("matches a saved website book to the app book it was made from, and drops it from the list", async () => {
    const db = fakeDb({ "systemStatus/inventoryLink": { ...STATE, appOnlyBooks: { at: "x", items: [{ id: "zine", title: "Fair Zine" }] } },
      "books/new1": { title: "Fair Zine", status: "draft" }, "books/b1": { title: "The Hound" } });
    const store = fakeStore();
    store.catalog = APP;
    const res = await inventoryLinkAdmin(deps(db, store), { op: "linkNewBook", bookId: "new1", inventoryBookId: "zine" });
    expect(res.status).toBe(200);
    expect(stateOf(db).links.new1).toEqual({ _: "zine" });
    expect(stateOf(db).appOnlyBooks.items).toEqual([]);
    const twice = await inventoryLinkAdmin(deps(db, store), { op: "linkNewBook", bookId: "new1", inventoryBookId: "zine" });
    expect(twice.body.already).toBe(true);
    const taken = await inventoryLinkAdmin(deps(db, store), { op: "linkNewBook", bookId: "new1", inventoryBookId: "hound" });
    expect(taken.status).toBe(409);
  });
  test("Not for the shop, and back", async () => {
    const db = fakeDb({ "systemStatus/inventoryLink": { ...STATE } });
    await inventoryLinkAdmin(deps(db, fakeStore()), { op: "ignoreAppBooks", ids: ["zine"] });
    expect(Object.keys(stateOf(db).ignoredAppBooks)).toEqual(["zine"]);
    await inventoryLinkAdmin(deps(db, fakeStore()), { op: "unignoreAppBooks", ids: ["zine"] });
    expect(stateOf(db).ignoredAppBooks).toEqual({});
  });
});

describe("review fixes", () => {
  test("a book linked from the app waits for its past sales before stock follows the app", async () => {
    const db = fakeDb({
      "systemStatus/inventoryLink": { links: { b1: { _: "hound" } }, connection: { ok: true }, startDay: "2026-10-01",
        backfill: { done: true }, autoSync: true, lastCatchUpAt: "2026-10-25T14:55:00Z", lastStockAt: "2026-10-25T14:00:00Z" },
      "books/b1": { title: "The Hound", trackInventory: true, stockLevel: 5 },
      "books/b2": { title: "Moth Hours", trackInventory: true, stockLevel: 5 },
    });
    const store = fakeStore();
    store.catalog = [{ id: "hound", title: "The Hound" }, { id: "zine", title: "Zine" }];
    store.feeds = { hound: { base: 5, onHand: 5 }, zine: { base: 8, onHand: 8 } };
    store.appDoc = { linkRequests: { "b2|": { inventoryBookId: "zine" } } };
    const out = await jobs.runSweep(deps(db, store));
    expect(out.stock).toEqual({ catchingUp: true });
    expect(db.docs["books/b2"].data.stockLevel).toBe(5);
    expect(stateOf(db).relinkPending).toBe(true);
  });
  test("an answered request is never applied again, even a month after the owner unmatched the book", async () => {
    const db = fakeDb({ "systemStatus/inventoryLink": { ...STATE }, "books/b1": { title: "The Hound" }, "books/b2": { title: "Moth Hours" } });
    const store = fakeStore();
    store.catalog = [{ id: "hound", title: "The Hound" }, { id: "zine", title: "Zine" }];
    store.appDoc = { linkRequests: { "b2|": { inventoryBookId: "zine", at: "2026-10-25T14:00:00Z" } } };
    await jobs.runSweep(deps(db, store));
    expect(stateOf(db).links.b2).toEqual({ _: "zine" });
    db.docs["systemStatus/inventoryLink"].data.links = { b1: { _: "hound" } };
    now = new Date(now.getTime() + 31 * 24 * 3600 * 1000);
    await jobs.runSweep(deps(db, store));
    expect(stateOf(db).links.b2).toBeUndefined();
    // Once the app drops the request, the answer goes after 30 days.
    store.appDoc = {};
    now = new Date(now.getTime() + 31 * 24 * 3600 * 1000);
    await jobs.runSweep(deps(db, store));
    expect(stateOf(db).appLinkReplies["b2|"]).toBeUndefined();
  });
  test("the website's own items never come back as the app's, and old covers still reach the app", () => {
    expect(link.cleanAppTodo({ at: "x", items: [{ id: "stock-held", title: "Stock waits on the website" }, { id: "needs-you", title: "2 need you" }] }).items.map(i => i.id)).toEqual(["needs-you"]);
    expect(link.smallCover({ photos: ["https://x/old.jpg"] })).toBe("https://x/old.jpg");
    expect(link.smallCover({ coverImage: "https://x/cover.jpg" })).toBe("https://x/cover.jpg");
  });
  test("Save matches refuses when a match arrived from the app in the meantime", async () => {
    const db = fakeDb({ "systemStatus/inventoryLink": { ...STATE }, "books/b1": { title: "The Hound" }, "books/b2": { title: "Moth Hours" } });
    const store = fakeStore();
    store.catalog = APP;
    const read = store.readCatalog;
    store.readCatalog = async () => { db.docs["systemStatus/inventoryLink"].data.links = { b1: { _: "hound" }, b2: { _: "zine" } }; return read(); };
    const res = await inventoryLinkAdmin(deps(db, store), { op: "saveLinks", links: { b1: { _: "hound" }, b4: { _: "altrove" } } });
    expect(res.status).toBe(409);
    expect(stateOf(db).links.b2).toEqual({ _: "zine" });
  });
});
