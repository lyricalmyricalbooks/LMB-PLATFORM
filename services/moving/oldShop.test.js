import { test } from "node:test";
import assert from "node:assert/strict";
import { NOT_AN_ADDRESS, NOTHING_FOUND, UNREACHABLE, readOldShop, shopOrigin, shopPath } from "./oldShop.js";
import { getPublicJson, privateAddress, publicHttps } from "./safeFetch.js";

/** A pretend web: answers by exact address; anything else is "no JSON here". */
const web = (pages) => async (url) => { web.asked.push(url); return url in pages ? pages[url] : null; };
web.asked = [];

const product = (n, extra = {}) => ({
  handle: `moth-${n}`, title: `Moth ${n}`, body_html: "<p>Poems.</p>", product_type: "Book", tags: ["poetry"],
  options: [{ name: "Edition" }],
  variants: [{ option1: "Paperback", sku: `M${n}-PB`, grams: 300, price: "20.00", compare_at_price: null, available: true },
    { option1: "Signed", sku: `M${n}-SG`, grams: 300, price: "35.00", compare_at_price: "40.00", available: false }],
  images: [{ src: "https://cdn.example/m1.jpg" }, { src: "//cdn.example/m2.jpg" }], ...extra,
});

test("the address the press types becomes one https origin", () => {
  assert.equal(shopOrigin("mothpress.example"), "https://mothpress.example");
  assert.equal(shopOrigin(" http://Shop.MothPress.example/collections/all "), "https://shop.mothpress.example");
  for (const bad of ["", "moth press", "localhost", "ftp://x.example", "https://a:b@x.example", "x".repeat(201)]) assert.equal(shopOrigin(bad), null, bad);
});

test("a products list, page by page, becomes a product file with versions, photos and old addresses", async () => {
  const first = { products: Array.from({ length: 100 }, (_, i) => product(i)) };
  const getJson = web({
    "https://mothpress.example/products.json?limit=100&page=1": first,
    "https://mothpress.example/products.json?limit=100&page=2": { products: [product(100)] },
  });
  const read = await readOldShop("mothpress.example", { getJson });
  assert.equal(read.ok, true);
  assert.equal(read.products, 101);
  const lines = read.csv.trim().split("\n");
  assert.equal(lines[0].split(",").at(-1), "Old page address");
  assert.match(lines[1], /^moth-0,Moth 0,<p>Poems\.<\/p>,Book,poetry,Edition,Paperback,/);
  assert.match(lines[1], /,M0-PB,300,,20,,https:\/\/cdn\.example\/m1\.jpg,1,\/products\/moth-0$/);
  // Sold out comes across as 0; the higher "was" price stays.
  assert.match(lines[2], /^moth-0,,,,,,Signed,,,,,M0-SG,300,0,35,40,https:\/\/cdn\.example\/m2\.jpg,2,$/);
  assert.ok(read.notes.some((n) => n.includes("Stock counts")));
});

test("a permalink list keeps each option's price, sold-out options and the old page address", async () => {
  const getJson = web({
    "https://zines.example/products.json?limit=100&page=1": [
      { name: "Tide Tables", permalink: "tide-tables", url: "/product/tide-tables", description: "Charts.", price: 15, status: "active",
        categories: [{ name: "Zines" }], images: [{ secure_url: "https://img.example/t.jpg" }],
        options: [{ name: "Small", price: 15, sold_out: false }, { name: "Large", price: 25, sold_out: true }] },
      { name: "Salt", permalink: "salt", url: "/product/salt", price: 8, options: [{ name: "Salt", price: 8, sold_out: false }], images: [] },
    ],
  });
  const read = await readOldShop("https://zines.example", { getJson });
  assert.equal(read.ok, true);
  const lines = read.csv.trim().split("\n");
  assert.match(lines[1], /^tide-tables,Tide Tables,Charts\.,Zines,,Option,Small,.*,15,,https:\/\/img\.example\/t\.jpg,1,\/product\/tide-tables$/);
  assert.match(lines[2], /^tide-tables,.*,Large,.*,0,25,,,,$/);
  assert.match(lines[3], /^salt,Salt,.*,8,,,,\/product\/salt$/);
});

test("the store list: prices in cents, sale prices, and a note for choices it can't price", async () => {
  const getJson = web({
    "https://press.example/wp-json/wc/store/v1/products?per_page=100&page=1": [
      { name: "Fern Atlas", slug: "fern-atlas", permalink: "https://press.example/product/fern-atlas/", sku: "FERN", is_in_stock: true,
        prices: { price: "2500", regular_price: "3000", currency_minor_unit: 2 }, categories: [{ name: "Books" }], tags: [{ name: "plants" }],
        images: [{ src: "https://press.example/f.jpg" }], variations: [{ id: 1 }] },
    ],
  });
  const read = await readOldShop("press.example", { getJson });
  assert.equal(read.ok, true);
  assert.match(read.csv.trim().split("\n")[1], /^fern-atlas,Fern Atlas,,Books,plants,.*,FERN,,,25,30,https:\/\/press\.example\/f\.jpg,1,\/product\/fern-atlas\/$/);
  assert.ok(read.notes[0].includes("1 product has choices"));
});

test("plain words when there's nothing to read or the site can't be reached", async () => {
  assert.deepEqual(await readOldShop("not an address"), { ok: false, message: NOT_AN_ADDRESS });
  assert.deepEqual(await readOldShop("empty.example", { getJson: async () => null }), { ok: false, message: NOTHING_FOUND });
  assert.deepEqual(await readOldShop("down.example", { getJson: async () => { throw new Error("boom"); } }), { ok: false, message: UNREACHABLE });
});

test("formula-looking cells are guarded in the file", async () => {
  const getJson = web({ "https://x.example/products.json?limit=100&page=1": { products: [product(1, { title: "=HYPERLINK(1)" })] } });
  const read = await readOldShop("x.example", { getJson });
  assert.match(read.csv, /,'=HYPERLINK\(1\),/);
});

test("the careful fetch: public https names only, private answers refused, redirects checked, JSON only", async () => {
  assert.equal(publicHttps("https://shop.example/products.json"), true);
  for (const bad of ["http://shop.example", "https://10.0.0.1", "https://localhost", "https://box.internal", "https://shop.example:8443"]) assert.equal(publicHttps(bad), false, bad);
  for (const a of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "192.168.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) assert.equal(privateAddress(a), true, a);
  assert.equal(privateAddress("93.184.216.34"), false);

  const lookup = async (host) => [{ address: host === "evil.example" ? "169.254.169.254" : "93.184.216.34", family: 4 }];
  const json = (body) => ({ status: 200, location: "", type: "application/json", body: Buffer.from(JSON.stringify(body)) });
  await assert.rejects(getPublicJson("https://evil.example/products.json", { lookup, get: async () => json({}) }), /private network/);
  const hops = [];
  const get = async (url) => { hops.push(url); return url.includes("old") ? { status: 301, location: "https://evil.example/x", type: "", body: Buffer.alloc(0) } : json({ ok: 1 }); };
  await assert.rejects(getPublicJson("https://old.example/products.json", { lookup, get }), /private network/);
  assert.deepEqual(hops, ["https://old.example/products.json"]);
  assert.deepEqual(await getPublicJson("https://fine.example/p.json", { lookup, get }), { ok: 1 });
  assert.equal(await getPublicJson("https://fine.example/p", { lookup, get: async () => ({ status: 200, location: "", type: "text/html", body: Buffer.from("<html>") }) }), null);
});

// The shape a store page answers with ?format=json (trimmed from a real demo store, 3 November 2026; plan 23.10).
const storeItem = (n, variants, extra = {}) => ({
  id: `i${n}`, title: `Moth ${n}`, urlId: `moth-${n}`, fullUrl: `/shop/p/moth-${n}`, excerpt: "<p>Poems.</p>", body: "", tags: ["poetry"],
  assetUrl: "https://cdn.example/a.jpg", items: [{ assetUrl: "https://cdn.example/m1.jpg" }, { assetUrl: "https://cdn.example/m2.jpg" }],
  structuredContent: { variantOptionOrdering: variants.length > 1 ? ["Edition"] : [], variants }, ...extra,
});
const storeVariant = (edition, price, extra = {}) => ({
  attributes: edition ? { Edition: edition } : {}, sku: `S-${edition || "one"}`, price: price * 100, priceMoney: { currency: "CAD", value: price.toFixed(2) },
  salePrice: 0, salePriceMoney: { currency: "CAD", value: "0.00" }, onSale: false, unlimited: false, qtyInStock: 4, ...extra,
});

test("the page the press typed after the address is kept, when it is a plain page", () => {
  assert.equal(shopPath("mothpress.example/books/"), "/books");
  assert.equal(shopPath("mothpress.example"), "");
  assert.equal(shopPath("mothpress.example/a/b/c/d"), "");
});

test("a store page read with its own format: stock counts, sale prices, choices, photos, next pages and old addresses", async () => {
  const first = {
    collection: { typeName: "products", fullUrl: "/books" },
    items: [storeItem(1, [storeVariant("Paperback", 20), storeVariant("Signed", 40, { onSale: true, salePriceMoney: { value: "35.00" }, qtyInStock: 0 })])],
    pagination: { nextPage: true, nextPageOffset: 1, nextPageUrl: "/books?offset=1" },
  };
  const second = { collection: { typeName: "products" }, items: [storeItem(2, [storeVariant("", 8, { unlimited: true, qtyInStock: 0 })])], pagination: {} };
  web.asked.length = 0;
  const getJson = web({
    "https://mothpress.example/books?format=json": first,
    "https://mothpress.example/books?offset=1&format=json": second,
    "https://mothpress.example/shop?format=json": { collection: { typeName: "page" }, items: [] },
  });
  const read = await readOldShop("mothpress.example/books", { getJson });
  assert.equal(read.ok, true, read.message);
  assert.equal(read.products, 2);
  const lines = read.csv.trim().split("\n");
  assert.equal(lines[0].split(",").at(-1), "Old page address");
  assert.equal(lines[1], "moth-1,Moth 1,<p>Poems.</p>,,poetry,Edition,Paperback,,,,,S-Paperback,,4,20,,https://cdn.example/m1.jpg,1,/shop/p/moth-1");
  assert.equal(lines[2], "moth-1,,,,,,Signed,,,,,S-Signed,,0,35,40,https://cdn.example/m2.jpg,2,");
  assert.equal(lines[3], "moth-2,Moth 2,<p>Poems.</p>,,poetry,,,,,,,S-one,,,8,,https://cdn.example/m1.jpg,1,/shop/p/moth-2");
  assert.match(read.notes.at(-1), /came from your old shop's pages/);
  // The press's own page is tried before the usual store page names.
  assert.ok(web.asked.indexOf("https://mothpress.example/books?format=json") < web.asked.indexOf("https://mothpress.example/shop?format=json") || !web.asked.includes("https://mothpress.example/shop?format=json"));
});

test("a store page whose next page points at another site stops there", async () => {
  const getJson = web({
    "https://mothpress.example/shop?format=json": { collection: { typeName: "products" }, items: [storeItem(1, [storeVariant("", 8)])], pagination: { nextPage: true, nextPageUrl: "https://elsewhere.example/shop?offset=1" } },
  });
  const read = await readOldShop("mothpress.example", { getJson });
  assert.equal(read.products, 1);
});

test("a site that ignores the page number brings each product over once, not once per page", async () => {
  const same = { products: Array.from({ length: 100 }, (_, i) => product(i)) };
  const asked = [];
  const read = await readOldShop("mothpress.example", { getJson: async (url) => { asked.push(url); return url.includes("/products.json") ? same : null; } });
  assert.equal(read.ok, true);
  assert.equal(read.products, 100);
  assert.equal(new Set(read.csv.trim().split("\n").slice(1).map((l) => l.split(",")[0])).size, 100);
  // It stops at the first page that brings nothing new.
  assert.equal(asked.length, 2);
});

test("a store list that repeats its last page stops there", async () => {
  const item = (n) => ({ slug: `moth-${n}`, name: `Moth ${n}`, prices: { price: "2000", regular_price: "2000", currency_minor_unit: 2 } });
  const full = Array.from({ length: 100 }, (_, i) => item(i));
  const read = await readOldShop("mothpress.example", { getJson: async (url) => (url.includes("/wp-json/") ? full : null) });
  assert.equal(read.products, 100);
});

test("a store page whose next-page link leads back to itself brings its products over once", async () => {
  const page = { collection: { typeName: "products" }, items: [storeItem(1, [storeVariant("", 8)]), storeItem(2, [storeVariant("", 8)])], pagination: { nextPage: true, nextPageUrl: "https://mothpress.example/shop?offset=0" } };
  const asked = [];
  const read = await readOldShop("mothpress.example", { getJson: async (url) => { asked.push(url); return url.startsWith("https://mothpress.example/shop?") ? page : null; } });
  assert.equal(read.products, 2);
  assert.equal(asked.filter((u) => u.includes("/shop?")).length, 2);
});

test("a list whose later page can't be read keeps what was read and says so", async () => {
  const full = { products: Array.from({ length: 100 }, (_, i) => product(i)) };
  const read = await readOldShop("mothpress.example", { getJson: async (url) => {
    if (url.endsWith("page=1")) return full;
    throw new Error("busy");
  } });
  assert.equal(read.ok, true);
  assert.equal(read.products, 100);
  assert.match(read.notes[0], /stopped answering after 100 products/);
});

test("a busy site is asked again after a short wait", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  let calls = 0;
  const get = async () => (++calls < 3 ? { status: 429, location: "", retryAfter: "1", type: "", body: Buffer.alloc(0) } : { status: 200, location: "", type: "application/json", body: Buffer.from('{"ok":1}') });
  assert.deepEqual(await getPublicJson("https://busy.example/p.json", { lookup, get, waitScale: 0 }), { ok: 1 });
  assert.equal(calls, 3);
});
