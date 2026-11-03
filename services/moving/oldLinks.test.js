// The old-link check's site-map reader (plan 23.8), against recorded site maps of the common layouts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_MAPS, NO_MAP, UNREACHABLE, locs, onSite, pathOf, readOldLinks, robotsMaps } from "./oldLinks.js";
import { getPublicText } from "./safeFetch.js";

const urlset = (...urls) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;
const index = (...urls) => `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<sitemap><loc>${u}</loc></sitemap>`).join("")}</sitemapindex>`;
/** A pretend web answering by exact address; anything else is "nothing here". Records what was asked. */
const web = (pages) => { const asked = []; const getText = async (url) => { asked.push(url); if (pages[url] instanceof Error) throw pages[url]; return pages[url] ?? null; }; return { asked, getText }; };

test("a map that lists other maps is followed, on the same site only, and robots.txt is read first", async () => {
  const { asked, getText } = web({
    "https://mothpress.example/robots.txt": "User-agent: *\nDisallow: /cart\nSitemap: https://mothpress.example/sitemap.xml\nSitemap: https://elsewhere.example/sitemap.xml\n",
    "https://mothpress.example/sitemap.xml": index(
      "https://mothpress.example/sitemap_products_1.xml?from=1&amp;to=99",
      "https://www.mothpress.example/sitemap_pages_1.xml",
      "https://evil.example/sitemap.xml",
      "https://mothpress.example/sitemap_blogs.xml.gz",
    ),
    "https://mothpress.example/sitemap_products_1.xml?from=1&to=99": urlset("https://mothpress.example/", "https://mothpress.example/products/moth-songs", "https://mothpress.example/products/salt%20hours/"),
    "https://www.mothpress.example/sitemap_pages_1.xml": urlset("<![CDATA[https://www.mothpress.example/pages/about-us]]>", "https://other.example/pages/x"),
  });
  const read = await readOldLinks("http://mothpress.example/shop", { getText });
  assert.deepEqual(read, {
    ok: true, host: "mothpress.example",
    paths: ["/", "/products/moth-songs", "/products/salt hours", "/pages/about-us"],
    notes: ["Part of your old shop's page list is packed in a form we can't read, so some pages may be missing below."],
  });
  assert.ok(!asked.some((u) => u.includes("evil.example") || u.includes("elsewhere.example")));
  // Once the shop's map answered, the other usual addresses are not tried.
  assert.ok(!asked.includes("https://mothpress.example/sitemap_index.xml"));
});

test("without robots.txt the usual addresses are tried in turn", async () => {
  const { getText } = web({ "https://shop.example/wp-sitemap.xml": urlset("https://shop.example/product/zine-one/", "https://shop.example/about/") });
  assert.deepEqual(await readOldLinks("shop.example", { getText }), { ok: true, host: "shop.example", paths: ["/product/zine-one", "/about"], notes: [] });
});

test("plain words when there is no map, the site can't be reached, or the address isn't one", async () => {
  assert.deepEqual(await readOldLinks("shop.example", web({}) ), { ok: false, message: NO_MAP });
  assert.deepEqual(await readOldLinks("shop.example", web({ "https://shop.example/robots.txt": new Error("the old shop took too long to answer") })), { ok: false, message: UNREACHABLE });
  assert.equal((await readOldLinks("not an address", web({}))).ok, false);
});

test("a shop with very many maps is read up to the limit, and says so", async () => {
  const pages = { "https://big.example/sitemap.xml": index(...Array.from({ length: 40 }, (_, i) => `https://big.example/s${i}.xml`)) };
  for (let i = 0; i < 40; i++) pages[`https://big.example/s${i}.xml`] = urlset(`https://big.example/p/${i}`);
  const { asked, getText } = web(pages);
  const read = await readOldLinks("big.example", { getText });
  assert.equal(asked.length, MAX_MAPS);
  assert.equal(read.paths.length, MAX_MAPS - 2);
  assert.match(read.notes[0], /more pages than one check reads/);
});

test("small helpers", () => {
  assert.deepEqual(locs("<loc> https://a.example/x?a=1&amp;b=2 </loc><LOC>https://a.example/y</LOC>"), ["https://a.example/x?a=1&b=2", "https://a.example/y"]);
  assert.deepEqual(robotsMaps("sitemap: https://a.example/one.xml\n  Sitemap:https://a.example/two.xml"), ["https://a.example/one.xml", "https://a.example/two.xml"]);
  assert.equal(onSite("/pages/a", "www.a.example"), "https://www.a.example/pages/a");
  assert.equal(onSite("https://b.example/x", "a.example"), null);
  assert.equal(onSite("javascript:alert(1)", "a.example"), null);
  assert.equal(pathOf("https://a.example/caf%C3%A9/"), "/café");
  assert.equal(pathOf("https://a.example/bad%E0"), "/bad%E0");
  assert.equal(pathOf("https://a.example"), "/");
});

test("the text read takes site maps and robots files only", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const answer = (type, body) => async () => ({ status: 200, location: "", type, body: Buffer.from(body) });
  assert.equal(await getPublicText("https://a.example/sitemap.xml", { lookup, get: answer("application/xml", "<urlset/>") }), "<urlset/>");
  assert.equal(await getPublicText("https://a.example/robots.txt", { lookup, get: answer("text/plain", "Sitemap: x") }), "Sitemap: x");
  assert.equal(await getPublicText("https://a.example/sitemap.xml", { lookup, get: answer("text/html", "<html>") }), null);
  let accept = "";
  await getPublicText("https://a.example/sitemap.xml", { lookup, get: async (_u, o) => { accept = o.accept; return { status: 404, location: "", type: "", body: Buffer.alloc(0) }; } });
  assert.match(accept, /xml/);
});
