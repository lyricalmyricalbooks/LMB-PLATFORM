// Bringing the old shop's own pages over (plan 23.6): which addresses are pages, and each page rebuilt safely.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PAGES, isPagePath, pageFromHtml, readOldPages, slugFor } from "./oldPages.js";

const URL0 = "https://mothpress.example/pages/about-us";

test("which old addresses are the shop's own pages", () => {
  for (const p of ["/pages/about-us", "/about", "/faq", "/shipping-and-returns.html", "/pages/Caf%C3%A9"]) assert.ok(isPagePath(p), p);
  for (const p of ["/", "/products/moth", "/collections/zines", "/cart", "/blogs/news/a", "/blog", "/policies/refund-policy", "/shop", "/about/team", "/logo.png", "/sitemap.xml", "/product-category/zines", "/de", "/en_GB", "/fr-ca"]) assert.ok(!isPagePath(p), p);
  assert.equal(slugFor("/pages/About-Us.html"), "about-us");
  assert.equal(slugFor("/pages/Café Noir"), "cafe-noir");
});

test("a page keeps its words, headings, lists and links, and its title, inside the shop's own part of the page", () => {
  const html = `<!doctype html><html><head><title>About us – Moth Press</title><style>p{color:red}</style></head><body>
    <header><nav><a href="/">Home</a><a href="/cart">Cart</a></nav></header>
    <main id="MainContent"><div class="page-width">
      <h1 class="title">About   the press</h1>
      <div class="rte">We make <strong>small</strong> books &amp; zines.<br>Since 2019.
        <h2>Visit</h2><p>Find us at <a href="https://mothpress.example/pages/contact?x=1">the studio</a> or <a href="https://maps.example/x">on the map</a>.</p>
        <ul><li>Fridays</li><li><em>Saturdays</em></li></ul>
        <p><img src="https://cdn.example/a.jpg"></p><p>   </p>
      </div></div></main>
    <footer>© Moth Press</footer><script>alert(1)</script></body></html>`;
  assert.deepEqual(pageFromHtml(html, URL0), {
    title: "About the press",
    body: '<p>We make <strong>small</strong> books &amp; zines.<br>Since 2019.</p><h2>Visit</h2><p>Find us at <a href="/pages/contact?x=1">the studio</a> or <a href="https://maps.example/x" rel="noopener">on the map</a>.</p><ul><li>Fridays</li><li><em>Saturdays</em></li></ul>',
    images: 1,
  });
});

test("nothing from another site can run or style itself: every tag is rebuilt, every attribute dropped", () => {
  const html = `<body><h1>Hi</h1>
    <p onclick="steal()" style="x">One <a href="javascript:alert(1)">bad link</a> <a href=" http://plain.example/x">http link</a></p>
    <iframe src="https://evil.example"></iframe><object data="x"></object>
    <p>2 &lt; 3 &amp; <b onmouseover=x>bold</b> & more > less</p>
    <div><span>Loose <u>text</u></span></div>
    <svg><script>alert(2)</script></svg><img src=x onerror=alert(3)>
    <a href="mailto:hello@mothpress.example">Write</a>
    <p>Unclosed <strong>bold<p>Next</body>`;
  const { title, body } = pageFromHtml(html, URL0);
  assert.equal(title, "Hi");
  assert.ok(!/on[a-z]+=|style=|javascript:|<script|<iframe|<object|<svg|<img|<span|<u>|<div/i.test(body), body);
  assert.match(body, /One bad link http link/);
  assert.match(body, /2 &lt; 3 &amp; <strong>bold<\/strong> &amp; more &gt; less/);
  assert.match(body, /<p>Loose text<\/p>/);
  assert.match(body, /<p><a href="mailto:hello@mothpress.example">Write<\/a><\/p>/);
  // Every tag that opens closes.
  const opens = body.match(/<(p|h2|h3|h4|ul|ol|li|blockquote|strong|em|a)\b/g)?.length;
  const closes = body.match(/<\/(p|h2|h3|h4|ul|ol|li|blockquote|strong|em|a)>/g)?.length;
  assert.equal(opens, closes);
});

test("without a main heading the window title names the page", () => {
  assert.equal(pageFromHtml("<title>FAQ | Moth Press</title><body><p>Q?</p></body>", URL0).title, "FAQ");
  assert.equal(pageFromHtml("<title>Moth Press - Shipping</title><body><p>Q?</p></body>", "https://www.mothpress.example/shipping").title, "Shipping");
});

test("reading pages: only page addresses on the old shop, a few at a time, with what couldn't come", async () => {
  const asked = [];
  const getPage = async (url) => {
    asked.push(url);
    if (url.endsWith("/faq")) return "<body><nav>only a menu</nav></body>";
    if (url.endsWith("/gone")) return null;
    if (url.endsWith("/boom")) throw new Error("too large");
    return `<body><main><h1>${url.split("/").pop()}</h1><p>Words.</p></main></body>`;
  };
  const read = await readOldPages("mothpress.example", ["/pages/about-us", "/faq", "/gone", "/boom", "/products/moth", "//evil.example/x", "/pages/about-us"], { getPage });
  assert.deepEqual(read, {
    ok: true, host: "mothpress.example",
    pages: [{ path: "/pages/about-us", slug: "about-us", title: "about-us", body: "<p>Words.</p>", images: 0 }],
    skipped: [{ path: "/faq", reason: "has no words we could bring over" }, { path: "/gone", reason: "couldn't be read" }, { path: "/boom", reason: "couldn't be read" }],
  });
  assert.ok(asked.every((u) => u.startsWith("https://mothpress.example/")));
  assert.equal(asked.length, 4);
  const many = Array.from({ length: 30 }, (_, i) => `/page-${i}`);
  const counted = [];
  await readOldPages("mothpress.example", many, { getPage: async (u) => { counted.push(u); return null; } });
  assert.equal(counted.length, MAX_PAGES);
  assert.equal((await readOldPages("mothpress.example", ["/products/x"], { getPage })).ok, false);
  assert.equal((await readOldPages("not an address", ["/about"], { getPage })).ok, false);
});
