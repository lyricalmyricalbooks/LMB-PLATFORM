// Does a page the publish run hasn't drawn yet really exist? (frontDoorRoutes.js) Its rules must match the storefront's
// own (findProduct, the redirect list), so a real page is never answered "not found".
import { describe, expect, it } from "vitest";
import { findProduct } from "../src/app/features/site/productRoutes";
import { findRedirect, normalizePath as siteNormalizePath, normalizeTarget as siteNormalizeTarget, redirectsFromStore } from "../src/app/features/site/redirects";
const { routeChecker, readCatalog, productSlugs, redirectMap, normalizePath, normalizeTarget, TTL_MS } = require("./frontDoorRoutes");

const BOOKS = [
  { id: "b1", slug: "night-buses", title: "Night Buses", status: "published" },
  { id: "b2", title: "Tea & Toast!", status: "published" },
  { id: "b3", slug: "secret", title: "Secret", status: "draft" },
  { id: "b4", title: "No Status" },
  { id: "b5", slug: "twin", title: "Twin A", status: "published" },
  { id: "b6", slug: "twin", title: "Twin B", status: "published" },
  { id: "b7", title: "Old Book", status: "archived" },
];
const CATALOG = {
  products: productSlugs(BOOKS),
  pages: new Set(["about", "policy-returns"]),
  redirects: redirectMap({ pages: [{ id: "1", items: [{ from: "/books/old-title", to: "/books/night-buses" }, { from: "/page/gone", to: "https://elsewhere.example/x" }] }] }),
};

describe("the storefront's own rules", () => {
  it("knows every product the storefront opens, and none it hides", () => {
    const slugs = productSlugs(BOOKS);
    const asked = ["b1", "night-buses", "b2", "tea-toast", "b4", "no-status", "b5", "twin", "secret", "b3", "b7", "old-book", "nothing"];
    for (const slug of asked) if (findProduct(BOOKS, slug)) expect(slugs.has(slug), slug).toBe(true);
    for (const slug of ["secret", "b3", "b7", "old-book", "nothing"]) expect(slugs.has(slug), slug).toBe(false);
  });
  it("reads and follows the redirect list exactly as the storefront does", () => {
    for (const input of ["/Books/Old/", "books//x?y=1#z", "https://a.example", "//evil", "", "/caf%C3%A9", "  /a b  "]) {
      expect(normalizePath(input)).toBe(siteNormalizePath(input));
    }
    for (const input of ["/new", "new", "https://shop.example/a", "http://a.example", "javascript:x", "//evil", "a b", ""]) {
      expect(normalizeTarget(input)).toBe(siteNormalizeTarget(input));
    }
    const stores = [
      { pages: [{ id: "2", items: [{ from: "/books/b", to: "/books/c" }] }, { id: "1", items: [{ from: "/Books/A/", to: "/books/b" }, { from: "/books/a", to: "/x" }] }, { id: "11", items: [{ from: "/books/z", to: "/y" }] }] },
      { pages: [{ id: "1", items: [{ from: "/books/loop", to: "/books/loop2" }, { from: "/books/loop2", to: "/books/loop" }, { from: "/books/self", to: "/books/self/" }, { from: "/", to: "/x" }] }] },
      { pages: [], legacy: { items: [{ from: "/page/old", to: "https://a.example/n" }] } },
      { pages: [], legacy: { paged: true, items: [{ from: "/page/old", to: "/n" }] } },
    ];
    const paths = ["/books/a", "/books/b", "/books/z", "/books/loop", "/books/loop2", "/books/self", "/page/old", "/"];
    for (const store of stores) {
      const map = redirectMap(store);
      const list = redirectsFromStore(store);
      for (const path of paths) expect(map.get(normalizePath(path)) ?? null, `${path} in ${JSON.stringify(store)}`).toBe(findRedirect(list, path));
    }
  });
});

describe("routeChecker", () => {
  const checker = (read = async () => CATALOG, now = () => 0) => routeChecker({ db: () => null, read, now, log: { error() {} } });
  const SHOP = { id: "press-a" };
  it("answers live, missing, redirected or unknown", async () => {
    const check = checker();
    expect(await check(SHOP, "/books/night-buses")).toEqual({ state: "live" });
    expect(await check(SHOP, "/products/b2/")).toEqual({ state: "live" });
    expect(await check(SHOP, "/books/tea%20toast")).toEqual({ state: "missing" });
    expect(await check(SHOP, "/page/policy-returns")).toEqual({ state: "live" });
    expect(await check(SHOP, "/books/secret")).toEqual({ state: "missing" });
    expect(await check(SHOP, "/books/Old-Title")).toEqual({ state: "missing", to: "/books/night-buses" }); // case is ignored on the old address
    expect(await check(SHOP, "/books/old-title")).toEqual({ state: "missing", to: "/books/night-buses" });
    expect(await check(SHOP, "/page/gone")).toEqual({ state: "missing", to: "https://elsewhere.example/x" });
    expect(await check(SHOP, "/collections/anything")).toEqual({ state: "unknown" });
    expect(await check(SHOP, "/books/%E0%A4%A")).toEqual({ state: "unknown" });
    expect(await check(SHOP, "/books/a/b")).toEqual({ state: "unknown" });
  });
  it("never sends on a page that exists", async () => {
    const catalog = { ...CATALOG, redirects: redirectMap({ pages: [{ id: "1", items: [{ from: "/books/night-buses", to: "/x" }] }] }) };
    expect(await checker(async () => catalog)(SHOP, "/books/night-buses")).toEqual({ state: "live" });
  });
  it("answers unknown when the shop can't be read, so a real page is never refused", async () => {
    const check = checker(async () => { throw new Error("down"); });
    expect(await check(SHOP, "/books/night-buses")).toEqual({ state: "unknown" });
  });
  it("reads each shop once every five minutes", async () => {
    let t = 0;
    const reads = [];
    const check = checker(async (_db, id) => { reads.push(id); return CATALOG; }, () => t);
    await check(SHOP, "/books/a");
    await check(SHOP, "/books/b");
    await check({ id: "press-b" }, "/books/a");
    expect(reads).toEqual(["press-a", "press-b"]);
    t = TTL_MS;
    await check(SHOP, "/books/a");
    expect(reads).toEqual(["press-a", "press-b", "press-a"]);
  });
});

describe("readCatalog", () => {
  const snap = docs => ({ docs: docs.map(([id, data]) => ({ id, data: () => data })) });
  const one = data => ({ exists: data !== undefined, data: () => data });
  function fakeDb(shopId) {
    const seen = [];
    const col = (path, docs) => ({ select: (...f) => { seen.push(`${path} select ${f.join(",")}`); return { get: async () => snap(docs) }; }, get: async () => { seen.push(path); return snap(docs); }, doc: id => ({ get: async () => { seen.push(`${path}/${id}`); return one(DOCS[`${path}/${id}`]); } }) });
    const DOCS = {
      [`shops/${shopId}/settings/website`]: { policies: { returns: "30 days", privacy: "  ", terms: "Terms" } },
      [`shops/${shopId}/settings/redirects`]: undefined,
    };
    const COLS = {
      books: [["b1", { slug: "a", status: "published" }], ["b2", { title: "Draft", status: "draft" }]],
      pages: [["p1", { slug: "about", status: "published" }], ["p2", { slug: "soon", status: "draft" }]],
      redirects: [["1", { items: [{ from: "/books/old", to: "/books/a" }] }]],
    };
    return {
      seen,
      db: () => ({ collection: name => ({ doc: id => ({ collection: sub => col(`${name}/${id}/${sub}`, COLS[sub] || []) }) }) }),
    };
  }
  it("reads only inside the shop's own folder, and only the fields it needs", async () => {
    const { db, seen } = fakeDb("press-a");
    const out = await readCatalog(db, "press-a");
    expect([...out.products]).toEqual(["b1", "a"]);
    expect([...out.pages].sort()).toEqual(["about", "policy-returns", "policy-terms"]);
    expect(out.redirects.get("/books/old")).toBe("/books/a");
    expect(seen.every(path => path.startsWith("shops/press-a/"))).toBe(true);
    expect(seen).toContain("shops/press-a/books select slug,title,status");
  });
});
