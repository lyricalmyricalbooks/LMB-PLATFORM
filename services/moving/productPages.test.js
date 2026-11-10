import { test } from "node:test";
import assert from "node:assert/strict";
import { productFromPage, productPaths, readProductPages, plainText } from "./productPages.js";
import { readOldShop } from "./oldShop.js";

const ld = (data) => `<html><head><script type="application/ld+json">${JSON.stringify(data).replace(/<\//g, "<\\/")}</script></head><body>x</body></html>`;

test("product-looking addresses are read first; lists, accounts and files never", () => {
  const paths = ["/", "/about", "/products/fern", "/shop/p/moth", "/product-page/zine", "/bookstore/a-c-3/b-p-191.html", "/collections/all", "/cart", "/products/fern/feed.xml", "/listing/12/print"];
  assert.deepEqual(productPaths(paths), ["/products/fern", "/shop/p/moth", "/product-page/zine", "/bookstore/a-c-3/b-p-191.html", "/listing/12/print"]);
  // No product-looking address: a sample of the plain ones is tried.
  assert.deepEqual(productPaths(["/", "/fern-atlas", "/cart"]), ["/fern-atlas"]);
});

test("a page's product data becomes one product with its price, sold-out flag, photos and old address", () => {
  const html = ld({ "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, {
    "@type": "Product", name: "Fern &amp; Moss", sku: "FERN", description: "<p>Poems</p><p>about ferns.</p>", image: ["https://cdn.example/f.jpg", { "@type": "ImageObject", url: "//cdn.example/g.jpg" }],
    category: "Books > Poetry", offers: { "@type": "Offer", price: "18.50", priceCurrency: "CAD", availability: "https://schema.org/OutOfStock" },
  }] });
  const p = productFromPage(html, "/products/Fern-Moss", "https://press.example/products/Fern-Moss");
  assert.equal(p.handle, "fern-moss");
  assert.equal(p.title, "Fern & Moss");
  assert.equal(p.html, "<p>Poems</p><p>about ferns.</p>");
  assert.equal(p.type, "Poetry");
  assert.deepEqual(p.versions, [{ picks: [], sku: "FERN", grams: "", stock: "0", price: "18.5", was: "" }]);
  assert.deepEqual(p.photos, ["https://cdn.example/f.jpg", "https://cdn.example/g.jpg"]);
  assert.equal(p.oldPath, "/products/Fern-Moss");
});

test("a product with choices keeps each choice and its price", () => {
  const html = ld({ "@type": "ProductGroup", name: "Moth tee", variesBy: ["https://schema.org/size"], hasVariant: [
    { "@type": "Product", name: "Moth tee - S", size: "S", sku: "T-S", offers: { price: 30 } },
    { "@type": "Product", name: "Moth tee - L", size: "L", sku: "T-L", offers: { price: 32, availability: "SoldOut" } },
  ] });
  const p = productFromPage(html, "/product/moth-tee", "https://press.example/product/moth-tee");
  assert.deepEqual(p.options, ["size"]);
  assert.deepEqual(p.versions.map((v) => [v.picks[0], v.price, v.stock]), [["S", "30", ""], ["L", "32", "0"]]);
});

test("without product data, a page that says it is a product to shared links still counts; other pages don't", () => {
  const html = `<meta property="og:type" content="product"><meta property="og:title" content="Atlas"><meta property="product:price:amount" content="12.00"><meta property="og:image" content="https://cdn.example/a.jpg">`;
  const p = productFromPage(html, "/item/atlas", "https://press.example/item/atlas");
  assert.equal(p.title, "Atlas");
  assert.equal(p.versions[0].price, "12");
  assert.deepEqual(p.photos, ["https://cdn.example/a.jpg"]);
  assert.equal(productFromPage(ld({ "@type": "Article", name: "News" }), "/news/a", "https://x.example/news/a"), null);
  assert.equal(productFromPage("<script type='application/ld+json'>{broken</script>", "/products/a", "https://x.example/products/a"), null);
});

test("nothing from the page runs: scripts and tags are dropped from the words", () => {
  assert.equal(plainText("<script>alert(1)</script><b>Bold</b> &lt;i&gt;"), "Bold <i>");
  const p = productFromPage(ld({ "@type": "Product", name: "<img src=x onerror=alert(1)>Zine", description: "<script>x()</script>Hi <b>there</b>", offers: { price: "5" } }), "/products/zine", "https://x.example/products/zine");
  assert.equal(p.title, "Zine");
  assert.equal(p.html, "<p>Hi there</p>");
});

test("pages are read until the budget runs out, and a site whose pages aren't products stops early", async () => {
  let clock = 0;
  const asked = [];
  const getPage = async (url) => { asked.push(url); clock += 1000; return ld({ "@type": "Product", name: url.split("/").pop(), offers: { price: 1 } }); };
  const paths = Array.from({ length: 100 }, (_, i) => `/products/p${i}`);
  const read = await readProductPages("https://x.example", paths, getPage, { now: () => clock, budgetMs: 10_000 });
  assert.ok(read.products.length > 0 && read.products.length < 100);
  assert.equal(read.more, true);
  const none = [];
  const notProducts = await readProductPages("https://x.example", Array.from({ length: 100 }, (_, i) => `/products/p${i}`), async (u) => { none.push(u); return "<html></html>"; });
  assert.deepEqual(notProducts.products, []);
  assert.equal(none.length, 24);
});

test("the address reader falls back to the site map: a store page found there, else the product pages", async () => {
  const map = `<urlset><url><loc>https://press.example/books/p/fern</loc></url><url><loc>https://press.example/about</loc></url></urlset>`;
  const getText = async (url) => (url === "https://press.example/robots.txt" ? "Sitemap: https://press.example/sitemap.xml" : url === "https://press.example/sitemap.xml" ? map : null);
  const storePage = { collection: { typeName: "products" }, items: [{ urlId: "fern", title: "Fern", fullUrl: "/books/p/fern", structuredContent: { variants: [{ priceMoney: { value: "9.00" }, qtyInStock: 3 }] } }] };
  const store = await readOldShop("press.example", { getJson: async (url) => (url === "https://press.example/books?format=json" ? storePage : null), getText, getPage: async () => null });
  assert.equal(store.ok, true, store.message);
  assert.match(store.csv, /\nfern,Fern,.*,3,9,/);

  const map2 = `<urlset><url><loc>https://press.example/product/zine-1</loc></url></urlset>`;
  const pages = await readOldShop("press.example", {
    getJson: async () => null,
    getText: async (url) => (url === "https://press.example/sitemap.xml" ? map2 : null),
    getPage: async (url) => (url === "https://press.example/product/zine-1" ? ld({ "@type": "Product", name: "Zine 1", offers: { price: "4" } }) : null),
  });
  assert.equal(pages.ok, true, pages.message);
  assert.match(pages.csv, /\nzine-1,Zine 1,.*,4,,,,\/product\/zine-1\n$/);
});

test("big marketplaces are answered straight away with their file", async () => {
  const read = await readOldShop("www.etsy.com/shop/moth", { getJson: async () => { throw new Error("should not be read"); } });
  assert.equal(read.ok, false);
  assert.match(read.message, /listings file/);
});
