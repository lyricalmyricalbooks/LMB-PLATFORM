// Bring a shop over from its web address (code plan 23.2). The press types its old shop's address; this reads the
// product list the common shop builders publish for everyone (no sign-in, no key) and writes it as a product file in
// the one-line-per-edition layout the shop's importer already reads (apps/shop/src/app/admin/shopMove.ts
// "handle-rows", the layout Backups & export also writes). The press's browser then previews that file exactly as if
// it had been downloaded and dropped in, so the preview, the safety rules and the old-link redirects are the same.
//
// Four public lists are tried, in order, each page by page: a `products` list at /products.json, a list of products
// with permalinks and options at the same address, the store list under /wp-json/wc/store/v1/products, and a store
// page read with ?format=json (the page the press typed, else /shop, /store, /products or /shop-1; plan 23.10). Only
// that last one shows stock counts; the others only say "sold out" (0). When none answers, the old shop's site map is
// read for its product pages: a store page found there is read as above, else each product page's own description of
// the product (productPages.js). Press-facing words never name another shop system.
import { getPublicJson, getPublicPage, getPublicText } from "./safeFetch.js";
import { readOldLinks } from "./oldLinks.js";
import { MAX_PAGE_PRODUCTS, readProductPages } from "./productPages.js";

export const MAX_PRODUCTS = 2000;
const PAGE_SIZE = 100;
const MAX_PAGES = MAX_PRODUCTS / PAGE_SIZE;

export const NOT_AN_ADDRESS = "Type your old shop's web address, like yourshop.com.";
export const NOTHING_FOUND = "We couldn't read the products at that address. Download the product file from your old shop instead, and choose it here.";
export const UNREACHABLE = "We couldn't reach that address. Check it and try again, or choose your old shop's product file instead.";
export const MARKETPLACE = "Big marketplaces don't let other sites read your shop. Download your listings file there and choose it here instead.";
/** Marketplaces that refuse every outside read: the press is sent to their file straight away. */
const MARKETPLACES = /(^|\.)(etsy\.com|ebay\.[a-z.]+|amazon\.[a-z.]+|faire\.com|redbubble\.com|society6\.com|depop\.com|vinted\.[a-z.]+)$/i;

/** The old shop's address as an https origin, from whatever the press typed ("yourshop.com", "http://…/shop"). */
export function shopOrigin(input) {
  const typed = String(input ?? "").trim();
  if (!typed || typed.length > 200 || /\s/.test(typed)) return null;
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || !u.hostname.includes(".")) return null;
  return `https://${u.hostname.toLowerCase()}`;
}

/** The page the press typed after the address ("/shop" from "yourshop.com/shop/"), or "" for none. */
export function shopPath(input) {
  const typed = String(input ?? "").trim();
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`);
    const path = u.pathname.replace(/\/+$/, "");
    return /^(\/[A-Za-z0-9._~-]+){1,3}$/.test(path) ? path : "";
  } catch { return ""; }
}

const HEADINGS = ["Handle", "Title", "Body (HTML)", "Type", "Tags", "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value",
  "Option3 Name", "Option3 Value", "Variant SKU", "Variant Grams", "Variant Inventory Qty", "Variant Price", "Variant Compare At Price",
  "Image Src", "Image Position", "Old page address"];

const cell = (v) => { const s = String(v ?? ""); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; };
const csvCell = (v) => { const s = cell(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const text = (v) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const https = (v, origin) => {
  const s = text(v).trim();
  if (!s) return "";
  try { const u = new URL(s.startsWith("//") ? `https:${s}` : s, origin); return u.protocol === "https:" || u.protocol === "http:" ? `https://${u.host}${u.pathname}${u.search}` : ""; } catch { return ""; }
};
const pathOf = (v, origin) => { try { const u = new URL(text(v), origin); return u.pathname !== "/" ? u.pathname : ""; } catch { return ""; } };
const money = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? String(Math.round(n * 100) / 100) : ""; };

/**
 * One product in this shop's words: { handle, title, html, type, tags[], options[] (names), versions: [{ picks[],
 * sku, grams, stock (0 or ""), price, was }], photos[], oldPath }.
 */
function rowsOf(p) {
  const rows = [];
  const versions = p.versions.length ? p.versions : [{ picks: [], sku: "", grams: "", stock: "", price: "", was: "" }];
  const lines = Math.max(versions.length, p.photos.length);
  for (let i = 0; i < lines; i++) {
    const v = versions[i];
    const row = Object.fromEntries(HEADINGS.map((h) => [h, ""]));
    row.Handle = p.handle;
    if (i === 0) {
      Object.assign(row, { Title: p.title, "Body (HTML)": p.html, Type: p.type, Tags: p.tags.join(", "), "Old page address": p.oldPath });
      p.options.slice(0, 3).forEach((name, n) => { row[`Option${n + 1} Name`] = name; });
    }
    if (v) {
      v.picks.slice(0, 3).forEach((value, n) => { row[`Option${n + 1} Value`] = value; });
      Object.assign(row, { "Variant SKU": v.sku, "Variant Grams": v.grams, "Variant Inventory Qty": v.stock, "Variant Price": v.price, "Variant Compare At Price": v.was });
    }
    if (p.photos[i]) Object.assign(row, { "Image Src": p.photos[i], "Image Position": String(i + 1) });
    rows.push(HEADINGS.map((h) => csvCell(row[h])).join(","));
  }
  return rows;
}

/** Products from a `{ products: [...] }` list (handles, variants with option1-3, images with src). */
export function fromProductsList(items, origin) {
  return items.filter((p) => p && text(p.handle) && text(p.title)).map((p) => {
    const options = (Array.isArray(p.options) ? p.options : []).map((o) => text(o?.name)).filter((n) => n && n !== "Title");
    const versions = (Array.isArray(p.variants) ? p.variants : []).map((v) => ({
      picks: [v?.option1, v?.option2, v?.option3].map(text).filter((x) => x && x !== "Default Title"),
      sku: text(v?.sku), grams: Number(v?.grams) > 0 ? String(Math.round(Number(v.grams))) : "", stock: v?.available === false ? "0" : "",
      price: money(v?.price), was: Number(v?.compare_at_price) > Number(v?.price) ? money(v.compare_at_price) : "",
    }));
    const tags = Array.isArray(p.tags) ? p.tags.map(text).filter(Boolean) : text(p.tags).split(",").map((t) => t.trim()).filter(Boolean);
    return {
      handle: text(p.handle).toLowerCase(), title: text(p.title), html: text(p.body_html), type: text(p.product_type), tags, options,
      versions, photos: (Array.isArray(p.images) ? p.images : []).map((i) => https(i?.src, origin)).filter(Boolean), oldPath: `/products/${text(p.handle).toLowerCase()}`,
    };
  });
}

/** Products from a list of products with a permalink and options (each option its own price and sold-out flag). */
export function fromPermalinkList(items, origin) {
  return items.filter((p) => p && text(p.permalink) && text(p.name)).map((p) => {
    const opts = Array.isArray(p.options) ? p.options : [];
    const several = opts.length > 1 || (opts.length === 1 && text(opts[0]?.name) && text(opts[0]?.name) !== text(p.name) && !/^default$/i.test(text(opts[0]?.name)));
    const version = (o) => ({ picks: several ? [text(o?.name)] : [], sku: "", grams: "", stock: o?.sold_out || p.status === "sold-out" ? "0" : "", price: money(o?.price ?? p.price), was: "" });
    const versions = opts.length ? (several ? opts.map(version) : [version(opts[0])]) : [version({ price: p.price })];
    const categories = (Array.isArray(p.categories) ? p.categories : []).map((c) => text(c?.name)).filter(Boolean);
    return {
      handle: text(p.permalink).toLowerCase(), title: text(p.name), html: text(p.description), type: categories[0] || "", tags: categories.slice(1),
      options: several ? ["Option"] : [], versions,
      photos: (Array.isArray(p.images) ? p.images : []).map((i) => https(i?.secure_url || i?.url, origin)).filter(Boolean),
      oldPath: pathOf(p.url, origin) || `/product/${text(p.permalink).toLowerCase()}`,
    };
  });
}

/** Products from the store list (prices in minor units; choices whose prices aren't public stay one version, with a note). */
export function fromStoreList(items, origin, notes) {
  let withChoices = 0;
  const products = items.filter((p) => p && text(p.slug) && text(p.name)).map((p) => {
    const minor = Number(p.prices?.currency_minor_unit);
    const unit = 10 ** (Number.isInteger(minor) && minor >= 0 && minor <= 4 ? minor : 2);
    const amount = (v) => (text(v) && Number.isFinite(Number(v)) ? money(Number(v) / unit) : "");
    const regular = amount(p.prices?.regular_price), now = amount(p.prices?.price) || regular;
    if (Array.isArray(p.variations) && p.variations.length) withChoices++;
    return {
      handle: text(p.slug).toLowerCase(), title: text(p.name), html: text(p.description) || text(p.short_description),
      type: (Array.isArray(p.categories) ? p.categories : []).map((c) => text(c?.name)).filter(Boolean)[0] || "",
      tags: (Array.isArray(p.tags) ? p.tags : []).map((t) => text(t?.name)).filter(Boolean), options: [],
      versions: [{ picks: [], sku: text(p.sku), grams: "", stock: p.is_in_stock === false ? "0" : "", price: now, was: Number(regular) > Number(now) ? regular : "" }],
      photos: (Array.isArray(p.images) ? p.images : []).map((i) => https(i?.src, origin)).filter(Boolean),
      oldPath: pathOf(p.permalink, origin),
    };
  });
  if (withChoices) notes.push(`${withChoices} product${withChoices === 1 ? " has" : "s have"} choices (like sizes) whose prices your old shop doesn't show publicly. ${withChoices === 1 ? "It comes" : "They come"} over with one price: add the choices in the product editor, or bring the product file instead.`);
  return products;
}

/**
 * Products from a store page's items (plan 23.10): each with structuredContent.variants (attributes by option name,
 * priceMoney, salePriceMoney when onSale, qtyInStock unless unlimited), photos in items[].assetUrl, fullUrl.
 */
export function fromStorePage(items, origin) {
  return items.filter((p) => p && text(p.urlId) && text(p.title)).map((p) => {
    const variants = Array.isArray(p.structuredContent?.variants) ? p.structuredContent.variants : Array.isArray(p.variants) ? p.variants : [];
    const ordering = Array.isArray(p.structuredContent?.variantOptionOrdering) ? p.structuredContent.variantOptionOrdering : p.variantOptionOrdering;
    const options = (Array.isArray(ordering) && ordering.length ? ordering : Object.keys(variants[0]?.attributes ?? {})).map(text).filter(Boolean);
    const amount = (m, cents) => (text(m?.value) ? money(m.value) : Number.isFinite(Number(cents)) ? money(Number(cents) / 100) : "");
    const versions = variants.map((v) => {
      const regular = amount(v?.priceMoney, v?.price), sale = v?.onSale ? amount(v?.salePriceMoney, v?.salePrice) : "";
      const onSale = Number(sale) > 0 && Number(sale) < Number(regular);
      const qty = Number(v?.qtyInStock);
      return {
        picks: options.map((n) => text(v?.attributes?.[n])).filter(Boolean), sku: text(v?.sku), grams: "",
        stock: v?.unlimited ? "" : Number.isInteger(qty) && qty >= 0 ? String(qty) : "", price: onSale ? sale : regular, was: onSale ? regular : "",
      };
    });
    const photos = (Array.isArray(p.items) ? p.items : []).map((i) => https(i?.assetUrl, origin)).filter(Boolean);
    return {
      handle: text(p.urlId).toLowerCase(), title: text(p.title), html: text(p.body) || text(p.excerpt), type: (Array.isArray(p.categories) ? p.categories.map(text).filter(Boolean) : [])[0] || "",
      tags: Array.isArray(p.tags) ? p.tags.map(text).filter(Boolean) : [], options: versions.some((v) => v.picks.length) ? options : [],
      versions, photos: photos.length ? photos : [https(p.assetUrl, origin)].filter(Boolean), oldPath: pathOf(p.fullUrl, origin),
    };
  });
}

const STORE_PAGES = ["/shop", "/store", "/products", "/shop-1"];
const isStorePage = (j) => j?.collection?.typeName === "products" && Array.isArray(j?.items);

/** A store page's items, following its next-page links on the same site. Null when no page is a store page. */
async function storePageItems(origin, typedPath, getJson, usual = STORE_PAGES) {
  for (const path of [...new Set([typedPath, ...usual].filter(Boolean))]) {
    let page = await getJson(`${origin}${path}?format=json`);
    if (!isStorePage(page)) continue;
    const items = [];
    const seen = new Set();
    // Each product once, by its address word: a next-page link that leads back to a page already read ends the list.
    const add = (batch) => batch.filter((p) => { const key = text(p?.urlId).toLowerCase(); if (key && seen.has(key)) return false; seen.add(key); items.push(p); return true; }).length;
    add(page.items);
    for (let n = 1; n < MAX_PAGES && items.length < MAX_PRODUCTS && page.pagination?.nextPage; n++) {
      const next = pathOf(page.pagination.nextPageUrl, origin) && new URL(text(page.pagination.nextPageUrl), origin);
      if (!next || next.origin !== origin) break;
      next.searchParams.set("format", "json");
      page = await getJson(next.href);
      if (!isStorePage(page) || !page.items.length || !add(page.items)) break;
    }
    return items.slice(0, MAX_PRODUCTS);
  }
  return null;
}

/**
 * The last way in: the old shop's public site map. A store page it lists (an address like /books/p/fern-atlas lives on
 * the store page /books) is read like the store pages above; else its product pages are read one by one.
 */
async function fromSiteMap(origin, input, { getJson, getText, getPage, notes, shown }) {
  let links;
  try { links = await readOldLinks(input, { getText }); } catch { return null; }
  if (!links?.ok) return null;
  const stores = [...new Set(links.paths.map((p) => /^((?:\/[^/]+){1,2})\/p\/[^/]+$/.exec(p)?.[1]).filter(Boolean))];
  for (const store of stores.slice(0, 3)) {
    const items = await storePageItems(origin, store, getJson, []);
    if (items?.length) { shown(); return fromStorePage(items, origin); }
  }
  const read = await readProductPages(origin, links.paths, getPage);
  if (read.more || read.products.length >= MAX_PAGE_PRODUCTS) notes.push(`We read your first ${read.products.length} products from their pages. Bring your old shop's product file for the rest.`);
  return read.products;
}

/** The products as a product file in the one-line-per-edition layout. */
export function productsCsv(products) {
  return [HEADINGS.join(","), ...products.flatMap(rowsOf)].join("\n") + "\n";
}

/**
 * Every item of a paged list, each once (by `keyOf`): a site that ignores the page number answers the same page again,
 * so a page that brings nothing new ends the list rather than repeating every product up to the cap.
 */
async function pages(first, next, read, keyOf) {
  const items = [];
  const seen = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = read(await (page === 1 ? first : next(page)));
    if (!batch) return page === 1 ? null : items;
    const fresh = batch.filter((item) => { const key = text(keyOf(item)).toLowerCase(); if (key && seen.has(key)) return false; seen.add(key); return true; });
    items.push(...fresh);
    if (!fresh.length || batch.length < PAGE_SIZE || items.length >= MAX_PRODUCTS) break;
  }
  return items.slice(0, MAX_PRODUCTS);
}

const publicJson = (url) => getPublicJson(url);
const none = async () => null;

/**
 * Reads the old shop at `input` (whatever the press typed). Answers { ok: true, host, csv, products, notes } or
 * { ok: false, message } in plain words. `getJson`, `getText` (site maps) and `getPage` (product pages) are the careful
 * fetch, injectable for tests; a test that gives `getJson` alone reads no site map or page.
 */
export async function readOldShop(input, { getJson = publicJson, getText = getJson === publicJson ? (url) => getPublicText(url) : none, getPage = getJson === publicJson ? (url) => getPublicPage(url) : none } = {}) {
  const origin = shopOrigin(input);
  if (!origin) return { ok: false, message: NOT_AN_ADDRESS };
  const host = new URL(origin).hostname;
  if (MARKETPLACES.test(host)) return { ok: false, message: MARKETPLACE };
  const notes = [];
  let stockShown = false;
  const listUrl = (page) => `${origin}/products.json?limit=${PAGE_SIZE}&page=${page}`;
  const storeUrl = (page) => `${origin}/wp-json/wc/store/v1/products?per_page=${PAGE_SIZE}&page=${page}`;
  try {
    const first = await getJson(listUrl(1));
    let products = null;
    if (Array.isArray(first?.products)) {
      products = fromProductsList(await pages(first, (n) => getJson(listUrl(n)), (j) => (Array.isArray(j?.products) && j.products.length ? j.products : null), (p) => p?.handle) ?? [], origin);
    } else if (Array.isArray(first) && first.some((p) => p && "permalink" in p)) {
      products = fromPermalinkList(await pages(first, (n) => getJson(listUrl(n)), (j) => (Array.isArray(j) && j.length ? j : null), (p) => p?.permalink) ?? [], origin);
    } else {
      const store = await pages(getJson(storeUrl(1)), (n) => getJson(storeUrl(n)), (j) => (Array.isArray(j) && j.length && j.some((p) => p && "slug" in p) ? j : null), (p) => p?.slug);
      if (store) products = fromStoreList(store, origin, notes);
      else {
        const page = await storePageItems(origin, shopPath(input), getJson);
        if (page) { products = fromStorePage(page, origin); stockShown = true; }
        else products = await fromSiteMap(origin, input, { getJson, getText, getPage, notes, shown: () => { stockShown = true; } });
      }
    }
    if (!products?.length) return { ok: false, message: NOTHING_FOUND };
    notes.push(stockShown ? "Stock counts came from your old shop's pages. Check them before you open." : "Stock counts aren't shown publicly, so check how many you have of each before you open.");
    return { ok: true, host, csv: productsCsv(products), products: products.length, notes };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}
