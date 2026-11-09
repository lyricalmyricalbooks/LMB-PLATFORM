// Running low (code plan 24.3): which shelf counts the 8am email lists, once per dip, and the job itself with fakes.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { lowStockLine, lowStockRows, newlyLow, lowStockLabel, lowStockEmailEnabled } = require("./lowStockAlert");
const { scheduledJobs } = require("./scheduledJobs");

const books = [
  { id: "moth", title: "Moth Notes", trackInventory: true, stockLevel: 2 },
  { id: "full", title: "Plenty", trackInventory: true, stockLevel: 40 },
  { id: "untracked", title: "Untracked", stockLevel: 0 },
  { id: "draft", title: "Draft", trackInventory: true, stockLevel: 0, status: "draft" },
  { id: "gone", title: "Archived", trackInventory: true, stockLevel: 0, status: "archived" },
  { id: "ebook", title: "Screen", trackInventory: true, stockLevel: 0, format: "E-book" },
  { id: "gift", title: "Gift card", trackInventory: true, stockLevel: 0, productType: "giftCard" },
  { id: "box", title: "Box set", trackInventory: true, stockLevel: 0, bundleItems: [{ bookId: "moth", quantity: 1 }] },
  {
    id: "tee", title: "Tee", trackInventory: true, stockLevel: 99,
    variants: [{ id: "s", name: "Small", stockLevel: 0 }, { id: "m", name: "Medium", stock: 30 }, { id: "pdf", name: "PDF", format: "PDF", stockLevel: 0 }],
  },
];

describe("lowStockRows", () => {
  it("lists tracked shelf counts at or below the line, one per edition, lowest first", () => {
    const rows = lowStockRows(books, 5);
    expect(rows.map((r) => [r.key, r.stock, r.state])).toEqual([["tee::s", 0, "out"], ["moth", 2, "low"]]);
    expect(lowStockLabel(rows[0])).toEqual({ name: "Tee (Small)", detail: "sold out" });
    expect(lowStockLabel(rows[1])).toEqual({ name: "Moth Notes", detail: "2 left" });
  });
  it("uses Inventory's low-stock line, 5 when unset or nonsense", () => {
    expect(lowStockLine({})).toBe(5);
    expect(lowStockLine({ inventory: { lowStockThreshold: 0 } })).toBe(0);
    expect(lowStockLine({ inventory: { lowStockThreshold: "3" } })).toBe(3);
    expect(lowStockLine({ inventory: { lowStockThreshold: -2 } })).toBe(5);
    expect(lowStockRows(books, 0).map((r) => r.key)).toEqual(["tee::s"]);
  });
});

describe("newlyLow", () => {
  it("reports an item once, again when it sells out, and forgets it once restocked", () => {
    const day1 = newlyLow([{ key: "a", state: "low" }, { key: "b", state: "out" }], {});
    expect(day1.fresh.map((r) => r.key)).toEqual(["a", "b"]);
    const day2 = newlyLow([{ key: "a", state: "low" }, { key: "b", state: "out" }], day1.marks);
    expect(day2.fresh).toEqual([]);
    const day3 = newlyLow([{ key: "a", state: "out" }], day2.marks);
    expect(day3.fresh.map((r) => r.key)).toEqual(["a"]);
    expect(day3.marks).toEqual({ a: "out" });
    expect(newlyLow([{ key: "b", state: "low" }], day3.marks).fresh.map((r) => r.key)).toEqual(["b"]);
  });
  it("is on unless switched off", () => {
    expect(lowStockEmailEnabled({})).toBe(true);
    expect(lowStockEmailEnabled({ shopAlerts: { lowStock: false } })).toBe(false);
  });
});

// The 8am job with a fake database: no orders to chase, one item running low.
function runDigest({ notifications = {}, marks = null, failSend = false } = {}) {
  const docs = {
    "settings/notifications": notifications,
    "settings/website": { inventory: { lowStockThreshold: 3 } },
    ...(marks ? { "systemStatus/lowStockAlerts": { items: marks } } : {}),
  };
  const writes = [];
  const sent = [];
  const snap = (data) => ({ exists: data !== undefined, data: () => data });
  const db = {
    collection: (name) => ({
      doc: (id) => ({
        get: async () => snap(docs[`${name}/${id}`]),
        set: async (data) => { writes.push({ path: `${name}/${id}`, data }); },
      }),
      get: async () => ({ docs: name === "books" ? books.map((b) => ({ id: b.id, data: () => b })) : [] }),
      where() { return this; }, orderBy() { return this; }, limit() { return this; },
    }),
    getAll: async () => [],
  };
  let handler;
  scheduledJobs({
    onSchedule: (opts, fn) => { if (opts.name === "dailyOrderDigest") handler = fn; return fn; },
    admin: { firestore: { FieldValue: { serverTimestamp: () => "now" } } },
    db, RESEND_API_KEY: { value: () => "k" }, ADMIN_TO: "owner@example.com", DIGEST_ORDER_LIMIT: 10, TRANSIT_DAYS: 14,
    buildOrderDigest: () => ({ total: 0, unshipped: [], stuck: [], labelChecks: [] }),
    dailyDigestEnabled: (s) => s?.shopAlerts?.dailyOrderDigest !== false,
    digestNeedsOperations: () => false, digestSince: () => "2026-01-01", escapeHtml: (s) => String(s),
    siteLink: (p) => `https://shop.example${p}`,
    sendEmail: async (mail) => { if (failSend) throw new Error("down"); sent.push(mail); },
    weeklySummaryEnabled: () => false, fairDayEmailEnabled: () => false,
  });
  return handler().then(() => ({ writes, sent }));
}

describe("the 8am email", () => {
  it("sends Running low on a day with no orders to chase, then saves the marks", async () => {
    const { sent, writes } = await runDigest();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("[STOCK] 2 items running low");
    expect(sent[0].html).toContain("Tee (Small) — sold out");
    expect(sent[0].html).toContain("Moth Notes — 2 left");
    expect(sent[0].html).toContain("/admin#inventory");
    expect(writes).toEqual([{ path: "systemStatus/lowStockAlerts", data: { items: { "tee::s": "out", moth: "low" }, updatedAt: "now" } }]);
  });
  it("stays quiet about items already reported", async () => {
    const { sent } = await runDigest({ marks: { "tee::s": "out", moth: "low" } });
    expect(sent).toHaveLength(0);
  });
  it("keeps the marks unchanged when the email fails, so tomorrow tries again", async () => {
    const { writes } = await runDigest({ failSend: true });
    expect(writes).toEqual([]);
  });
  it("sends nothing when both switches are off", async () => {
    const { sent } = await runDigest({ notifications: { shopAlerts: { dailyOrderDigest: false, lowStock: false } } });
    expect(sent).toHaveLength(0);
  });
  it("still runs Running low with the orders email switched off", async () => {
    const { sent } = await runDigest({ notifications: { shopAlerts: { dailyOrderDigest: false } } });
    expect(sent).toHaveLength(1);
  });
});
