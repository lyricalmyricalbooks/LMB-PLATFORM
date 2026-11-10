// GENERATED from services/moving/productPages.js by services/moving/sync.mjs. Edit the source, never this copy.
// The last way to read an old shop from its address: its own product pages. Shops on builders with no public product
// list still describe each product to search engines inside the page (a "Product" block of structured data, else the
// product tags sharing services read). This finds the product pages in the old shop's public site map (oldLinks.js),
// reads them a few at a time through the careful fetch, and answers each in the shop's words, ready for oldShop.js to
// write as the product file. Nothing from the page is trusted: only plain values are taken (names, prices, words,
// photo addresses), and the description is plain text. Press-facing words never name another shop system.

export const MAX_PAGE_PRODUCTS = 300;
/** The whole read stops here, so an answer always reaches the press's browser inside the server's time limit. */
export const PAGE_BUDGET_MS = 35_000;
const AT_ONCE = 6;
/** Pages tried when the site map shows no product-looking address: enough to tell whether its pages are products. */
const SAMPLE = 24;

/** Addresses that look like one product: /products/x, /product/x, /p/x, /product-page/x, /listing/1/x, /item/x, …-p-12.html. */
const PRODUCT_PATH = /(^|\/)(products?|p|product-page|listing|listings|item|items|catalog\/product|merch|book|books)\/[^/]+(\/[^/]*)?$|-p-\d+(\.html?)?$|\/dp\/[^/]+$/i;
/** Addresses that are never a product: lists, accounts, posts, the site map itself. */
const NEVER = /(^|\/)(cart|checkout|account|login|register|search|tags?|categor(y|ies)|product-category|product-tag|collections?|blogs?|news|journal|feed|policies|pages|wp-[a-z-]+|sitemap[^/]*|cdn|apps|tools|admin|password)(\/|$)|\.(xml|txt|pdf|jpe?g|png|gif|webp|zip)$/i;

/** The old addresses worth reading as product pages, best first: product-looking ones, else a sample of the rest. */
export function productPaths(paths) {
  const plain = paths.filter((p) => p && p !== "/" && !NEVER.test(p));
  const likely = plain.filter((p) => PRODUCT_PATH.test(p));
  return likely.length ? likely : plain.filter((p) => p.split("/").length >= 2).slice(0, SAMPLE);
}

const decode = (s) => String(s ?? "").replace(/&#(\d{1,7});/g, (_, n) => safeChar(Number(n))).replace(/&#x([0-9a-f]{1,6});/gi, (_, n) => safeChar(parseInt(n, 16)))
  .replace(/&nbsp;/gi, " ").replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&");
const safeChar = (n) => (n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "");
/** Plain text from HTML or text: tags out, entities decoded, spaces folded. */
export const plainText = (s) => decode(String(s ?? "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n").replace(/<[^>]*>/g, " "))
  .replace(/[ \t\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const textOf = (v) => (typeof v === "string" ? decode(v).trim() : typeof v === "number" ? String(v) : "");
const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const isType = (node, type) => list(node?.["@type"]).some((t) => String(t).replace(/^https?:\/\/schema\.org\//i, "") === type);
const money = (v) => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return String(v ?? "").trim() && Number.isFinite(n) && n >= 0 ? String(Math.round(n * 100) / 100) : ""; };

/** Every structured-data block on the page, parsed; blocks that don't parse are skipped. */
export function dataBlocks(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { out.push(JSON.parse(m[1].trim().replace(/^<!--|-->$/g, ""))); } catch { /* a broken block is skipped */ }
  }
  return out;
}

/** Every node in the blocks (arrays, @graph and nested values walked), so a product inside a page or list is found. */
function nodes(value, out = [], depth = 0) {
  if (depth > 8 || value == null || typeof value !== "object") return out;
  if (Array.isArray(value)) { for (const v of value) nodes(v, out, depth + 1); return out; }
  out.push(value);
  for (const key of ["@graph", "mainEntity", "itemListElement", "item", "hasVariant", "isVariantOf"]) if (value[key]) nodes(value[key], out, depth + 1);
  return out;
}

const photoUrl = (v, pageUrl) => {
  const raw = typeof v === "string" ? v : textOf(v?.contentUrl) || textOf(v?.url);
  if (!raw) return "";
  try { const u = new URL(raw.startsWith("//") ? `https:${raw}` : raw, pageUrl); return /^https?:$/.test(u.protocol) ? `https://${u.host}${u.pathname}${u.search}` : ""; } catch { return ""; }
};

/** One offer's { price, was, soldOut } (a range offer gives its lowest price). */
function offerOf(offers) {
  const all = list(offers).flatMap((o) => (isType(o, "AggregateOffer") && o.offers ? list(o.offers) : [o])).filter((o) => o && typeof o === "object");
  const o = all[0];
  if (!o) return { price: "", was: "", soldOut: false };
  const spec = list(o.priceSpecification)[0];
  const price = money(o.price ?? o.lowPrice ?? spec?.price);
  const listPrice = list(o.priceSpecification).find((s) => /ListPrice|StrikethroughPrice/i.test(textOf(s?.priceType)));
  const was = money(listPrice?.price);
  const availability = textOf(o.availability);
  return { price, was: Number(was) > Number(price) ? was : "", soldOut: /OutOfStock|SoldOut|Discontinued/i.test(availability) };
}

const slugOf = (path) => {
  const last = String(path || "").split("/").filter(Boolean).pop() || "";
  let word = last.replace(/\.html?$/i, "");
  try { word = decodeURIComponent(word); } catch { /* keep it */ }
  return word.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
};

/** A meta tag's content (property= or name=), decoded. */
function meta(html, key) {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name|itemprop)\\s*=\\s*["']${key.replace(/[.:]/g, "\\$&")}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  const m = tag && /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
  return m ? decode(m[1] ?? m[2]).trim() : "";
}

/**
 * The product a page describes, in the shop's words ({ handle, title, html, type, tags, options, versions, photos,
 * oldPath }), or null when the page isn't one product. Structured data first; else the product tags shared links read.
 */
export function productFromPage(html, path, pageUrl) {
  const found = dataBlocks(html).flatMap((b) => nodes(b));
  const group = found.find((n) => isType(n, "ProductGroup"));
  const product = group || found.find((n) => isType(n, "Product") && textOf(n.name));
  const handle = slugOf(path);
  if (!handle) return null;
  if (product) {
    const variants = group ? list(group.hasVariant).filter((v) => v && typeof v === "object" && isType(v, "Product")) : [];
    const varies = list(group?.variesBy).map((v) => textOf(v).replace(/^https?:\/\/schema\.org\//i, "")).filter(Boolean);
    const nameOf = (v) => {
      const picked = varies.map((k) => textOf(v[k.charAt(0).toLowerCase() + k.slice(1)])).filter(Boolean);
      if (picked.length) return picked.join(" / ");
      const full = textOf(v.name), base = textOf(group.name);
      return (full.startsWith(base) ? full.slice(base.length).replace(/^[\s\-–—:,/|]+/, "") : full) || full;
    };
    const versions = (variants.length > 1 ? variants : [product]).map((v) => {
      const offer = offerOf(v.offers ?? product.offers);
      return { picks: variants.length > 1 ? [nameOf(v)].filter(Boolean) : [], sku: textOf(v.sku), grams: "", stock: offer.soldOut ? "0" : "", price: offer.price, was: offer.was };
    });
    const photos = [...new Set([...list(product.image), ...variants.flatMap((v) => list(v.image))].map((i) => photoUrl(i, pageUrl)).filter(Boolean))].slice(0, 20);
    const category = textOf(list(product.category)[0]?.name ?? list(product.category)[0]).split(/\s*>\s*/).pop() || "";
    const description = plainText(textOf(product.description) || meta(html, "og:description"));
    return {
      handle, title: plainText(textOf(product.name)), html: description ? `<p>${description.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n+/g, "</p><p>")}</p>` : "",
      type: category, tags: [], options: variants.length > 1 ? [varies.length === 1 ? varies[0] : "Option"] : [], versions, photos, oldPath: path,
    };
  }
  // No structured data: a page that tells shared links it is a product, with its price.
  if (!/^product/i.test(meta(html, "og:type"))) return null;
  const title = plainText(meta(html, "og:title"));
  if (!title) return null;
  const price = money(meta(html, "product:price:amount") || meta(html, "og:price:amount"));
  const soldOut = /out ?of ?stock|oos|sold/i.test(meta(html, "product:availability") || meta(html, "og:availability"));
  const description = plainText(meta(html, "og:description"));
  const photo = photoUrl(meta(html, "og:image"), pageUrl);
  return {
    handle, title, html: description ? `<p>${description.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : "", type: "", tags: [], options: [],
    versions: [{ picks: [], sku: "", grams: "", stock: soldOut ? "0" : "", price, was: "" }], photos: photo ? [photo] : [], oldPath: path,
  };
}

/**
 * Reads the product pages at `paths` on `origin`, a few at a time, until MAX_PAGE_PRODUCTS products or the time budget.
 * Answers { products, more } (more: some pages weren't read). A page that can't be read is skipped. A sample of pages
 * that turns up no product at all ends the read early.
 */
export async function readProductPages(origin, paths, getPage, { now = () => Date.now(), budgetMs = PAGE_BUDGET_MS } = {}) {
  const start = now();
  const queue = productPaths(paths);
  const products = [];
  const handles = new Set();
  let tried = 0;
  while (queue.length && products.length < MAX_PAGE_PRODUCTS && now() - start < budgetMs) {
    if (tried >= SAMPLE && !products.length) break;
    const batch = queue.splice(0, AT_ONCE);
    tried += batch.length;
    const read = await Promise.all(batch.map(async (path) => {
      const url = `${origin}${path.split("/").map((part) => encodeURIComponent(safeDecode(part))).join("/")}`;
      try { const html = await getPage(url); return html ? productFromPage(html, path, url) : null; } catch { return null; }
    }));
    for (const p of read) {
      if (!p || handles.has(p.handle) || products.length >= MAX_PAGE_PRODUCTS) continue;
      handles.add(p.handle);
      products.push(p);
    }
  }
  return { products, more: queue.length > 0 && products.length > 0 };
}

function safeDecode(part) { try { return decodeURIComponent(part); } catch { return part; } }
