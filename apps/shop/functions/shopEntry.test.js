// How each way into the server finds its shop (shopEntry.js): triggers from the document path, web requests from
// ?shop=<id>, the five-minute tick once per shop that isn't closed. One shop's failure never touches another.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { shopEntries } = require("./shopEntry");
const { currentShop } = require("./shopScope");

let before;
beforeEach(() => { before = process.env.SHOP_FOLDERS; process.env.SHOP_FOLDERS = "on"; });
afterEach(() => { if (before === undefined) delete process.env.SHOP_FOLDERS; else process.env.SHOP_FOLDERS = before; });

/** The database root with shop records only, counting reads. */
function rootWith(records) {
  const reads = { doc: 0, list: 0 };
  const ids = Object.keys(records).sort();
  const page = (after, n) => {
    const start = after ? ids.indexOf(after.id) + 1 : 0;
    return ids.slice(start, start + n).map(id => ({ id, data: () => records[id] }));
  };
  const db = {
    collection: name => {
      expect(name).toBe("shops");
      const q = { _after: null, _n: 1000,
        orderBy: () => q, limit: n => { q._n = n; return q; }, startAfter: d => { q._after = d; return q; },
        get: async () => { reads.list += 1; return { docs: page(q._after, q._n) }; },
        doc: id => ({ get: async () => { reads.doc += 1; return { exists: id in records, data: () => records[id] }; } }),
      };
      return q;
    },
  };
  return { rootDb: () => db, reads };
}

const records = {
  "press-a": { tenant: "t-a", ownerEmail: "owner@a.example", status: "open", server: { SHOP_SITE_URL: "https://a.example" } },
  "press-b": { tenant: "t-b", ownerEmail: "owner@b.example", status: "open" },
  "press-c": { tenant: "t-c", ownerEmail: "owner@c.example", status: "closed" },
};
const quiet = { warn: vi.fn(), error: vi.fn() };

function res() {
  const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } };
  return r;
}

describe("database triggers", () => {
  it("listen inside the shop folders and run in the shop the document belongs to", async () => {
    const { rootDb } = rootWith(records);
    const entry = shopEntries({ rootDb, env: {}, log: quiet });
    const made = [];
    const make = (opts, handler) => { made.push(opts); return handler; };
    const onA = entry.trigger(make)("orders/{orderId}", async () => currentShop());
    const onB = entry.trigger(make)({ document: "books/{bookId}", region: "x" }, async () => currentShop());
    expect(made).toEqual(["shops/{shopId}/orders/{orderId}", { document: "shops/{shopId}/books/{bookId}", region: "x" }]);
    const shop = await onA({ params: { shopId: "press-a", orderId: "1" } });
    expect(shop).toMatchObject({ id: "press-a", folder: "shops/press-a", tenant: "t-a" });
    expect(shop.config.ownerEmail).toBe("owner@a.example");
    expect(shop.config.siteUrl).toBe("https://a.example");
    expect((await onB({ params: { shopId: "press-b" } })).config.ownerEmail).toBe("owner@b.example");
  });
  it("skip a change in a folder with no shop record, and refuse one with no shop at all", async () => {
    const entry = shopEntries({ rootDb: rootWith(records).rootDb, env: {}, log: quiet });
    const handler = vi.fn();
    await expect(entry.forEvent(handler)({ params: { shopId: "nobody" } })).resolves.toBeUndefined();
    await expect(entry.forEvent(handler)({ params: {} })).rejects.toThrow(/no shop/);
    expect(handler).not.toHaveBeenCalled();
  });
  it("read a shop record once per half minute", async () => {
    let t = 0;
    const { rootDb, reads } = rootWith(records);
    const entry = shopEntries({ rootDb, env: {}, log: quiet, now: () => t });
    await entry.loadShop("press-a");
    await entry.loadShop("press-a");
    expect(reads.doc).toBe(1);
    t = 31_000;
    await entry.loadShop("press-a");
    expect(reads.doc).toBe(2);
  });
});

describe("web requests", () => {
  it("run in the shop named by ?shop=", async () => {
    const entry = shopEntries({ rootDb: rootWith(records).rootDb, env: {}, log: quiet });
    const handler = entry.forRequest(async (req, r) => r.status(200).json({ shop: currentShop().id }));
    const r = res();
    await handler({ query: { shop: "press-b" } }, r);
    expect(r.body).toEqual({ shop: "press-b" });
  });
  it("answer 400 with no shop and 404 for an unknown or malformed one, without running the handler", async () => {
    const entry = shopEntries({ rootDb: rootWith(records).rootDb, env: {}, log: quiet });
    const inner = vi.fn();
    const handler = entry.forRequest(inner);
    for (const [query, code] of [[{}, 400], [{ shop: "nobody" }, 404], [{ shop: "../x" }, 404], [{ shop: ["press-a"] }, 400]]) {
      const r = res();
      await handler({ query }, r);
      expect(r.code).toBe(code);
      expect(r.body.code).toBe("no_shop");
    }
    expect(inner).not.toHaveBeenCalled();
  });
});

describe("the five-minute tick", () => {
  it("runs once for every shop that isn't closed, each in its own folder, past a failing one", async () => {
    const many = { ...records };
    for (let i = 0; i < 205; i++) many[`press-z${String(i).padStart(3, "0")}`] = { tenant: "", status: "open" };
    const entry = shopEntries({ rootDb: rootWith(many).rootDb, env: {}, log: quiet });
    const seen = [];
    const results = await entry.eachShop(async shop => {
      expect(currentShop().id).toBe(shop.id);
      seen.push(shop.folder);
      if (shop.id === "press-a") throw new Error("broken shop");
      return shop.id;
    });
    expect(seen).not.toContain("shops/press-c");
    expect(seen).toContain("shops/press-b");
    expect(seen).toHaveLength(207);
    expect(results.find(r => r.id === "press-a")).toMatchObject({ ok: false, error: "broken shop" });
    expect(results.filter(r => r.ok)).toHaveLength(206);
  });
});
