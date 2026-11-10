// Bring your shop with you (plan 3.1). Pure: reads the product or customer export another shop system gives a press,
// and turns it into what this shop's own importers take. Books go through the same preview and safety rules as
// Books › Import CSV (catalogImport.ts): matched by ISBN, then SKU, then title; new books are drafts; import never
// publishes. Customers become private notes and tags, and newsletter subscribers only with the owner's say-so.
//
// The words a press sees never name another shop system: a file is "an export from your old shop". The shapes below
// are told apart by their column headings only, so an unknown file falls back to the plain spreadsheet import.

import { metricWeightValue } from "../features/site/metricWeight";
import { MAX_IMPORT_ROWS, parseCsv, parseMoney, planImport, validIsbn, type ImportOptions, type ImportPlan, type ImportRow } from "./catalogImport";
import { MOVED_MARK, parseTags } from "./customerInsights";
import { addToIndex, MAX_REDIRECTS, normalizePath, redirectIndex, redirectProblemIn, type Redirect } from "../features/site/redirects";
import { MAX_OPTIONS, MAX_VARIANTS, type ProductOption } from "../../shared/productOptions";
import { productHref } from "../lib/productHref";

/** Which shape an export has. Named after how its rows are laid out, not after who made it. */
export type ExportShape =
  | "handle-rows"     // one line per edition, grouped by a Handle column; photos on their own lines
  | "product-id-rows" // a product line, then one line per extra edition with a blank title
  | "parent-rows"     // product lines with Type simple/variable; editions are "variation" lines pointing at a Parent
  | "listing-rows"    // one line per listing with numbered photo columns (IMAGE1…)
  | "field-type-rows" // a line marked Product, then its lines marked Variant under the same handleId (plan 23.1)
  | "variation-name-rows" // one line per variation, named by Item Name and Variation Name, stock per location (plan 23.1)
  | "item-rows"       // an Item column of Product, then its Variant and Image lines; options as Name=…|Value=… (plan 23.10)
  | "sku-rows"        // an Item Type column of Product, then its SKU and Rule lines; options in the name, [S]Size=M (plan 23.10)
  | "typed-rows";     // a type column of product or product_variation; versions point at their product by id (plan 23.10)

export interface MovedEdition {
  name: string; price: number; salePrice: number; stock: number | null; sku: string; weight: string; photoUrl: string;
  /** The old shop's choices for this version, by option name ({ Size: "M", Colour: "Black" }; plan 10.6). */
  picks?: Record<string, string>;
}

/** One product from the old shop, in this shop's import columns (catalogImport IMPORT_COLUMNS labels). */
export interface MovedBook {
  /** The file line the product starts on (the heading is line 1). */
  line: number;
  cells: Record<string, string>;
  /** Two or more when the product was sold in several versions (hardcover, signed copy…). */
  editions: MovedEdition[];
  /**
   * The product's options (Size, Colour…) when the old shop named them and every version picks one value of each
   * (plan 10.6): the product page then shows a button per value. Empty: the versions stay a plain editions list.
   */
  options: ProductOption[];
  /** The product's addresses on the old shop, for the redirects that keep old links working (plan 3.2). */
  oldPaths: string[];
  notes: string[];
}

export interface ProductMove {
  shape: ExportShape;
  books: MovedBook[];
  problems: string[];
  /**
   * A blank stock cell means the old shop didn't count that product. False only for one-line-per-edition files with no
   * stock-counting column: a file read from an old shop's address leaves counts blank because they aren't public.
   */
  blankIsUncounted: boolean;
  /** Lines of the file that were left out, in plain words (shown above the preview). */
  notices: string[];
}

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const unguard = (value: string) => String(value ?? "").trim().replace(/^'([=+\-@\t\r])/, "$1");

/** Reads a table by heading, whatever order the columns are in. */
function columns(headings: string[]) {
  const at = new Map<string, number>();
  headings.forEach((h, i) => { const k = key(h); if (k && !at.has(k)) at.set(k, i); });
  const has = (...names: string[]) => names.every(n => at.has(key(n)));
  const get = (row: string[], ...names: string[]) => {
    for (const n of names) { const i = at.get(key(n)); if (i !== undefined && unguard(row[i] ?? "") !== "") return unguard(row[i]); }
    return "";
  };
  const heading = (pattern: RegExp) => headings.find(h => pattern.test(key(h))) || "";
  return { has, get, heading };
}

export function recognizeExport(headings: string[]): ExportShape | null {
  const { has } = columns(headings);
  if (has("Handle", "Title", "Variant Price") || has("URL handle", "Title", "Price")) return "handle-rows";
  if (has("Product ID [Non Editable]", "Variant ID [Non Editable]", "Title", "Price")) return "product-id-rows";
  if (has("Type", "Parent", "Name", "Regular price")) return "parent-rows";
  if (has("TITLE", "PRICE", "QUANTITY", "IMAGE1")) return "listing-rows";
  if (has("handleId", "fieldType", "name", "price")) return "field-type-rows";
  if (has("Token", "Item Name", "Variation Name", "Price")) return "variation-name-rows";
  if (has("Item", "Name", "SKU", "Options", "Price")) return "item-rows";
  if (has("Item Type", "Product Name", "Price")) return "sku-rows";
  if (has("type", "product_name", "product_price")) return "typed-rows";
  return null;
}

// ── Words ─────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const decode = (text: string) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});

/**
 * An HTML product description → this shop's description text (descriptionLinks.ts): paragraphs and line breaks kept,
 * bold, italic, links, headings, lists, quotes and dividers written the way the editor's toolbar writes them, every
 * other tag dropped. Plain text comes back as it was.
 */
export function htmlToDescription(html: string): string {
  let s = String(html ?? "").replace(/\r\n?/g, "\n");
  if (!/<[a-z!/][^>]*>/i.test(s)) return decode(s).trim();
  s = s.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/\n/g, " ");
  s = s.replace(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi, (_m, _q, d, single, label) => {
    const href = decode(d ?? single ?? "").trim();
    const text = label.replace(/<[^>]+>/g, "").trim();
    return /^(https?:|mailto:|\/)/i.test(href) && text ? `[${text}](${href})` : text;
  });
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner) => (inner.trim() ? `**${inner.trim()}**` : ""));
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner) => (inner.trim() ? `*${inner.trim()}*` : ""));
  s = s.replace(/<h[1-2]\b[^>]*>([\s\S]*?)<\/h[1-2]>/gi, "\n\n## $1\n\n").replace(/<h[3-6]\b[^>]*>([\s\S]*?)<\/h[3-6]>/gi, "\n\n### $1\n\n");
  s = s.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1").replace(/<\/?(ul|ol)\b[^>]*>/gi, "\n\n");
  s = s.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, inner) => `\n\n> ${inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}\n\n`);
  s = s.replace(/<hr\b[^>]*>/gi, "\n\n---\n\n").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|section|article|table|tr)>/gi, "\n\n");
  s = decode(s.replace(/<[^>]+>/g, ""));
  return s.split("\n").map(line => line.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ── Products ──────────────────────────────────────────────────────

const money = (value: string) => { const n = parseMoney(value); return Number.isNaN(n) ? NaN : n; };
const count = (value: string): number | null => { const s = value.replace(/[\s,]/g, ""); return /^-?\d+$/.test(s) ? Math.max(0, Number(s)) : null; };
const list = (value: string, sep: RegExp = /,/) => [...new Set(value.split(sep).map(s => s.trim()).filter(Boolean))];
const https = (value: string) => { try { const u = new URL(value.trim()); return u.protocol === "https:" ? u.href : ""; } catch { return ""; } };
const grams = (value: string) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? `${Math.round(n)} g` : ""; };

/** Price and sale price, from a regular price and a lower "was"/sale price in either order. */
function prices(price: string, other: string, otherIsWas: boolean): { price: number; salePrice: number } {
  const a = money(price), b = money(other);
  if (Number.isNaN(a)) return { price: NaN, salePrice: 0 };
  if (Number.isNaN(b) || b <= 0) return { price: a, salePrice: 0 };
  if (otherIsWas) return b > a ? { price: b, salePrice: a } : { price: a, salePrice: 0 };
  return b < a ? { price: a, salePrice: b } : { price: a, salePrice: 0 };
}

/** A version's choices from (option name, value) pairs, or undefined when it names none. "Title" is no option. */
function picksOf(pairs: [string, string][]): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const [name, value] of pairs) {
    if (!name || !value || key(name) === "title" || seen.has(key(name))) continue;
    seen.add(key(name));
    out[name] = value;
  }
  return seen.size ? out : undefined;
}

/**
 * The options of a product whose versions all pick one value of the same options, each version a different
 * combination; [] otherwise, and the versions stay a plain editions list.
 */
function optionsOf(editions: MovedEdition[]): ProductOption[] {
  const names = Object.keys(editions[0]?.picks || {});
  if (!names.length || names.length > MAX_OPTIONS || editions.length > MAX_VARIANTS) return [];
  const same = (e: MovedEdition) => !!e.picks && Object.keys(e.picks).length === names.length && names.every(n => e.picks![n]);
  if (!editions.every(same)) return [];
  const combos = new Set(editions.map(e => names.map(n => e.picks![n].toLowerCase()).join("\u0000")));
  if (combos.size !== editions.length) return [];
  return names.map(name => ({ name, values: [...new Map(editions.map(e => [e.picks![name].toLowerCase(), e.picks![name]])).values()] }));
}

function book(line: number, cells: Record<string, string>, editions: MovedEdition[], photos: string[], oldPaths: string[], notes: string[] = []): MovedBook {
  const out: Record<string, string> = { ...cells };
  const urls = [...new Set(photos.map(https).filter(Boolean))];
  if (urls.length) out["Image URL"] = urls[0];
  if (urls.length > 1) out["Extra image URLs"] = urls.slice(1).join("|");
  const real = editions.filter(e => !Number.isNaN(e.price));
  if (editions.length === 1 || (real.length && real.every(e => !e.name))) {
    const e = real[0] || editions[0];
    if (e) {
      if (!Number.isNaN(e.price)) out.Price = String(e.price);
      if (e.salePrice > 0) out["Sale price"] = String(e.salePrice);
      if (e.stock !== null) out.Stock = String(e.stock);
      if (e.sku) out.SKU = e.sku;
      if (e.weight && !out.Weight) out.Weight = e.weight;
    }
    return { line, cells: out, editions: [], options: [], oldPaths, notes };
  }
  if (editions.length > 1) {
    const unpriced = editions.filter(e => Number.isNaN(e.price));
    if (unpriced.length) notes.push(`${unpriced.map(e => e.name || "An edition").join(", ")} had no price in the file, so ${unpriced.length === 1 ? "it was" : "they were"} left out.`);
    const kept = editions.filter(e => !Number.isNaN(e.price));
    if (kept.length === 1) return book(line, out, kept, [], oldPaths, notes);
    if (kept.length) out.Price = String(Math.min(...kept.map(e => e.price)));
    const stock = kept.map(e => e.stock).filter((n): n is number => n !== null);
    if (stock.length) out.Stock = String(stock.reduce((t, n) => t + n, 0));
    if (!out.Weight && kept[0]?.weight) out.Weight = kept[0].weight;
    return { line, cells: out, editions: kept, options: optionsOf(kept), oldPaths, notes };
  }
  return { line, cells: out, editions: [], options: [], oldPaths, notes };
}

// One line per edition comes in two sets of headings: the older one (Handle, Variant Price, Image Src…) and the one
// exports use today (URL handle, Price, Product image URL…; the list and its source are in the research notes of
// 28 October 2026, "Moving in"). Each name below is read under either heading; old files keep working.
const HANDLE = ["Handle", "URL handle"];
const PRICE = ["Variant Price", "Price"];
const WAS_PRICE = ["Variant Compare At Price", "Compare-at price"];
const SKU = ["Variant SKU", "SKU"];
const STOCK = ["Variant Inventory Qty", "Inventory quantity"];
const GRAMS = ["Variant Grams", "Weight value (grams)"];
const PHOTO = ["Image Src", "Product image URL"];
const EDITION_PHOTO = ["Variant Image", "Variant image URL"];
// Which system counts an edition's stock; blank means nobody does (digital files, services, untracked goods).
const TRACKER = ["Variant Inventory Tracker", "Inventory tracker"];

function fromHandleRows(table: string[][]): MovedBook[] {
  const c = columns(table[0]);
  // "Barcode" became "Barcodes"; a file that has both is read from Barcodes.
  const BARCODE = c.has("Barcodes") ? ["Barcodes"] : ["Variant Barcode", "Barcode"];
  const tracked = TRACKER.some(n => c.has(n)) ? (r: string[]) => !!c.get(r, ...TRACKER) : () => true;
  const groups = new Map<string, { line: number; rows: string[][] }>();
  table.slice(1).forEach((row, i) => {
    const handle = c.get(row, ...HANDLE).toLowerCase();
    if (!handle) return;
    if (!groups.has(handle)) groups.set(handle, { line: i + 2, rows: [] });
    groups.get(handle)!.rows.push(row);
  });
  return [...groups.entries()].map(([handle, { line, rows }]) => {
    const head = rows.find(r => c.get(r, "Title")) || rows[0];
    const editions: MovedEdition[] = [];
    const photos: { at: number; url: string }[] = [];
    rows.forEach((r, i) => {
      const src = c.get(r, ...PHOTO);
      if (src) photos.push({ at: Number(c.get(r, "Image Position")) || 1000 + i, url: src });
      if (!c.get(r, ...PRICE) && !c.get(r, ...SKU) && !c.get(r, "Option1 Value")) return;
      const name = ["Option1 Value", "Option2 Value", "Option3 Value"].map(n => c.get(r, n)).filter(v => v && v.toLowerCase() !== "default title").join(" / ");
      // Option names are on the product's first line only.
      const picks = picksOf([1, 2, 3].map(n => [c.get(head, `Option${n} Name`), c.get(r, `Option${n} Value`)]));
      const p = prices(c.get(r, ...PRICE), c.get(r, ...WAS_PRICE), true);
      const variantImage = c.get(r, ...EDITION_PHOTO);
      editions.push({ name, ...p, stock: tracked(r) ? count(c.get(r, ...STOCK)) : null, sku: c.get(r, ...SKU), weight: grams(c.get(r, ...GRAMS)), photoUrl: https(variantImage), ...(picks ? { picks } : {}) });
      if (variantImage) photos.push({ at: 2000 + i, url: variantImage });
    });
    const cells: Record<string, string> = { Title: c.get(head, "Title") };
    const description = htmlToDescription(c.get(head, "Body (HTML)", "Body HTML", "Description"));
    if (description) cells.Description = description;
    const tags = list(c.get(head, "Tags"));
    if (tags.length) cells.Tags = tags.join(";");
    const type = c.get(head, "Type", "Product Type");
    if (type) cells.Categories = type;
    const barcode = editions.length === 1 ? c.get(rows.find(r => c.get(r, ...BARCODE)) || head, ...BARCODE) : "";
    if (barcode && validIsbn(barcode)) cells.ISBN = barcode;
    const seoTitle = c.get(head, "SEO title"), seoDescription = c.get(head, "SEO description");
    if (seoTitle) cells["SEO title"] = seoTitle;
    if (seoDescription) cells["SEO description"] = seoDescription;
    // A file made from an old shop's address (plan 23.2) says where each product's page was.
    const oldPage = c.get(head, "Old page address");
    return book(line, cells, editions, photos.sort((a, b) => a.at - b.at).map(p => p.url), [oldPage.startsWith("/") ? oldPage : `/products/${handle}`]);
  });
}

function fromProductIdRows(table: string[][]): MovedBook[] {
  const c = columns(table[0]);
  const optionHeads = table[0].map(h => key(h)).filter(k => /^option value \d+$/.test(k));
  const out: { line: number; head: string[]; rows: string[][] }[] = [];
  table.slice(1).forEach((row, i) => {
    const id = c.get(row, "Product ID [Non Editable]");
    const last = out[out.length - 1];
    if (c.get(row, "Title") || !last || (id && id !== c.get(last.head, "Product ID [Non Editable]"))) out.push({ line: i + 2, head: row, rows: [row] });
    else last.rows.push(row);
  });
  return out.map(({ line, head, rows }) => {
    const editions = rows.map(r => {
      const onSale = /^(yes|true|1)$/i.test(c.get(r, "On Sale"));
      const p = prices(c.get(r, "Price"), onSale ? c.get(r, "Sale Price") : "", false);
      const stock = /^unlimited$/i.test(c.get(r, "Stock")) ? null : count(c.get(r, "Stock"));
      // "Option Value 2" is named by "Option Name 2", on the product's first line.
      const picks = picksOf(optionHeads.map(h => [c.get(head, h.replace("value", "name")) || c.get(r, h.replace("value", "name")), c.get(r, h)]));
      return { name: optionHeads.map(h => c.get(r, h)).filter(Boolean).join(" / "), ...p, stock, sku: c.get(r, "SKU"), weight: "", photoUrl: "", ...(picks ? { picks } : {}) };
    });
    const cells: Record<string, string> = { Title: c.get(head, "Title") };
    const description = htmlToDescription(c.get(head, "Description"));
    if (description) cells.Description = description;
    const tags = list(c.get(head, "Tags"));
    if (tags.length) cells.Tags = tags.join(";");
    const categories = list(c.get(head, "Categories"));
    if (categories.length) cells.Categories = categories.join(";");
    const page = c.get(head, "Product Page").replace(/^\/+|\/+$/g, ""), slug = c.get(head, "Product URL").replace(/^\/+|\/+$/g, "");
    const oldPaths = page && slug ? [`/${page}/p/${slug}`, `/${page}/${slug}`] : [];
    return book(line, cells, editions, list(c.get(head, "Hosted Image URLs"), /\s+/), oldPaths);
  });
}

function fromParentRows(table: string[][], notices: string[]): MovedBook[] {
  const c = columns(table[0]);
  const weightHeading = c.heading(/^weight\b/);
  const unit = /\blbs?\b/.test(key(weightHeading)) ? "lb" : /\boz\b/.test(key(weightHeading)) ? "oz" : /\bg\b/.test(key(weightHeading)) ? "g" : "kg";
  const weight = (row: string[]) => { const n = Number(c.get(row, weightHeading)); return weightHeading && Number.isFinite(n) && n > 0 ? metricWeightValue(`${n} ${unit}`) : ""; };
  const attributeHeads = table[0].map(h => key(h)).filter(k => /^attribute \d+ value s$/.test(k));
  const text = (row: string[], ...names: string[]) => c.get(row, ...names).replace(/\\n/g, "\n");
  const products: { line: number; row: string[]; variations: string[][] }[] = [];
  const byRef = new Map<string, (typeof products)[number]>();
  const variations: string[][] = [];
  table.slice(1).forEach((row, i) => {
    const type = c.get(row, "Type").toLowerCase();
    if (/\bvariation\b/.test(type)) { variations.push(row); return; }
    if (!/\b(simple|variable)\b/.test(type)) return;
    const p = { line: i + 2, row, variations: [] as string[][] };
    products.push(p);
    const id = c.get(row, "ID"), sku = c.get(row, "SKU");
    if (id) byRef.set(`id:${id}`, p);
    if (sku) byRef.set(sku.toLowerCase(), p);
  });
  const orphans: string[] = [];
  for (const v of variations) {
    const parent = c.get(v, "Parent");
    const p = byRef.get(parent.toLowerCase()) || byRef.get(parent.replace(/^id:\s*/i, "id:").toLowerCase());
    if (p) p.variations.push(v); else orphans.push(c.get(v, "Name") || c.get(v, "SKU"));
  }
  if (orphans.length) notices.push(`${orphans.length} variation line${orphans.length === 1 ? "" : "s"} (${orphans.slice(0, 3).join(", ")}${orphans.length > 3 ? "…" : ""}) belonged to no product in the file, so ${orphans.length === 1 ? "it was" : "they were"} left out.`);
  return products.map(({ line, row, variations: vs }) => {
    const editionRow = (r: string[], name: string, picks?: Record<string, string>): MovedEdition => ({ name, ...prices(c.get(r, "Regular price"), c.get(r, "Sale price"), false), stock: count(c.get(r, "Stock")), sku: c.get(r, "SKU"), weight: weight(r), photoUrl: https(list(c.get(r, "Images"))[0] || ""), ...(picks ? { picks } : {}) });
    // "Attribute 1 value(s)" is named by "Attribute 1 name", on the variation's line or else the product's.
    const attributeName = (v: string[], h: string) => { const n = h.replace(/ value s$/, " name"); return c.get(v, n) || c.get(row, n); };
    const editions = vs.length
      ? vs.map(v => editionRow(v, attributeHeads.map(h => c.get(v, h)).filter(Boolean).join(" / ") || c.get(v, "Name"),
        picksOf(attributeHeads.map(h => [attributeName(v, h), c.get(v, h)]))))
      : [editionRow(row, "")];
    const cells: Record<string, string> = { Title: c.get(row, "Name") };
    const description = htmlToDescription(text(row, "Description") || text(row, "Short description"));
    if (description) cells.Description = description;
    const categories = list(c.get(row, "Categories").replace(/\\,/g, "\u0000")).map(s => s.split(">").pop()!.trim().replace(/\u0000/g, ","));
    if (categories.length) cells.Categories = [...new Set(categories)].join(";");
    const tags = list(c.get(row, "Tags"));
    if (tags.length) cells.Tags = tags.join(";");
    const w = weight(row);
    if (w) cells.Weight = w;
    const notes = /\b(variable)\b/i.test(c.get(row, "Type")) && !vs.length ? ["This product had choices in your old shop, but none of them were in the file."] : [];
    return book(line, cells, editions, list(c.get(row, "Images")), [], notes);
  });
}

function fromListingRows(table: string[][]): MovedBook[] {
  const c = columns(table[0]);
  const imageHeads = table[0].map(h => key(h)).filter(k => /^image\d+$/.test(k)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
  return table.slice(1).map((row, i) => {
    const cells: Record<string, string> = { Title: c.get(row, "TITLE") };
    const description = htmlToDescription(c.get(row, "DESCRIPTION"));
    if (description) cells.Description = description;
    const tags = list(c.get(row, "TAGS"));
    if (tags.length) cells.Tags = tags.join(";");
    const notes: string[] = [];
    for (const n of [1, 2]) {
      const values = c.get(row, `VARIATION ${n} VALUES`);
      if (values) notes.push(`Your old shop offered ${c.get(row, `VARIATION ${n} NAME`, `VARIATION ${n} TYPE`) || "choices"} (${values}) without a price or stock for each, so add them as editions in the book editor.`);
    }
    const edition: MovedEdition = { name: "", ...prices(c.get(row, "PRICE"), "", false), stock: count(c.get(row, "QUANTITY")), sku: c.get(row, "SKU"), weight: "", photoUrl: "" };
    return book(i + 2, cells, [edition], imageHeads.map(h => c.get(row, h)), [], notes);
  }).filter(b => b.cells.Title || b.cells.Price);
}

/** A product page address made from a name the way most shop builders make one ("Moth Songs!" → "moth-songs"). */
const slugOf = (name: string) => name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// A line marked Product, then one line per version marked Variant under the same handleId (plan 23.1, from the
// per-row product template the research notes of 3 November 2026 list). The product line names up to six options
// (productOptionName1…) and its price; a version's line gives its choices (productOptionDescription1…), its stock and
// a surcharge on top of the product's price. Photos are links separated by semicolons; the discount is a percent or an
// amount off. Stock is a number, or InStock/OutOfStock when the old shop didn't count it.
function fromFieldTypeRows(table: string[][], notices: string[]): MovedBook[] {
  const c = columns(table[0]);
  const optionNumbers = table[0].map(h => /^productoptionname(\d+)$/i.exec(h.replace(/\s+/g, ""))?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
  const stockOf = (row: string[]) => { const v = c.get(row, "inventory"); return /^outofstock$/i.test(v) ? 0 : count(v); };
  const products: { line: number; head: string[]; variants: string[][] }[] = [];
  const byHandle = new Map<string, (typeof products)[number]>();
  let strays = 0;
  table.slice(1).forEach((row, i) => {
    const handle = c.get(row, "handleId"), type = c.get(row, "fieldType").toLowerCase();
    if (type === "product") { const p = { line: i + 2, head: row, variants: [] as string[][] }; products.push(p); if (handle) byHandle.set(handle, p); return; }
    if (type !== "variant") return;
    const p = byHandle.get(handle);
    if (p) p.variants.push(row); else strays++;
  });
  if (strays) notices.push(`${strays} version line${strays === 1 ? "" : "s"} belonged to no product in the file, so ${strays === 1 ? "it was" : "they were"} left out.`);
  return products.map(({ line, head, variants }) => {
    const base = money(c.get(head, "price"));
    const off = Number(c.get(head, "discountValue")), mode = c.get(head, "discountMode").toLowerCase();
    const sale = (price: number) => {
      if (Number.isNaN(price) || !(off > 0)) return 0;
      const s = mode === "percent" ? price * (1 - off / 100) : mode === "amount" ? price - off : NaN;
      return s > 0 && s < price ? Math.round(s * 100) / 100 : 0;
    };
    const names = optionNumbers.map(n => c.get(head, `productOptionName${n}`));
    const edition = (row: string[], name: string, picks?: Record<string, string>): MovedEdition => {
      const surcharge = money(c.get(row, "surcharge"));
      const price = Number.isNaN(base) ? NaN : Math.round((base + (Number.isNaN(surcharge) ? 0 : surcharge)) * 100) / 100;
      const kg = Number(c.get(row, "weight"));
      return { name, price, salePrice: sale(price), stock: stockOf(row), sku: c.get(row, "sku"), weight: Number.isFinite(kg) && kg > 0 ? metricWeightValue(`${kg} kg`) : "", photoUrl: "", ...(picks ? { picks } : {}) };
    };
    const editions = variants.length
      ? variants.map(v => {
        // A colour choice is written "#ffc0cb:Pink" or "rgb(255,121,0):Orange"; the shopper sees the name.
        const values = optionNumbers.map(n => c.get(v, `productOptionDescription${n}`).replace(/^\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s*:\s*(?=\S)/i, ""));
        return edition(v, values.filter(Boolean).join(" / "), picksOf(names.map((n, i) => [n, values[i]])));
      })
      : [edition(head, "")];
    const title = c.get(head, "name");
    const cells: Record<string, string> = { Title: title };
    const description = htmlToDescription(c.get(head, "description"));
    if (description) cells.Description = description;
    const collections = list(c.get(head, "collection"), /;/);
    if (collections.length) cells.Categories = collections.join(";");
    const kg = Number(c.get(head, "weight"));
    if (Number.isFinite(kg) && kg > 0) cells.Weight = metricWeightValue(`${kg} kg`);
    const notes = /^false$/i.test(c.get(head, "visible")) ? ["This product was hidden in your old shop."] : [];
    // The export has no page address, so the one the old shop makes from the name is kept.
    const slug = slugOf(title);
    return book(line, cells, editions, list(c.get(head, "productImageUrl"), /;/), slug ? [`/product-page/${slug}`] : [], notes);
  });
}

// One line per variation (plan 23.1): lines with the same Item Name are one product, Variation Name names the version
// ("Regular" when there is one), stock is in a "Current Quantity <place>" column per place (added up), and options,
// when the old shop named them, are in Option Name n / Option Value n. A price of "variable" or blank leaves the
// version out with a note; archived items are left out.
function fromVariationNameRows(table: string[][], notices: string[]): MovedBook[] {
  const c = columns(table[0]);
  const stockAt = table[0].map((h, i) => (/^current quantity\b/.test(key(h)) ? i : -1)).filter(i => i >= 0);
  const optionNumbers = table[0].map(h => /^option name (\d+)$/.exec(key(h))?.[1]).filter(Boolean).map(Number);
  const products: { line: number; rows: string[][] }[] = [];
  const byName = new Map<string, (typeof products)[number]>();
  let archived = 0;
  table.slice(1).forEach((row, i) => {
    const name = c.get(row, "Item Name");
    if (!name) return;
    if (/^(y|yes|true)$/i.test(c.get(row, "Archived"))) { archived++; return; }
    const k = name.toLowerCase();
    if (!byName.has(k)) { const p = { line: i + 2, rows: [] as string[][] }; byName.set(k, p); products.push(p); }
    byName.get(k)!.rows.push(row);
  });
  if (archived) notices.push(`${archived} archived line${archived === 1 ? " was" : "s were"} left out.`);
  return products.map(({ line, rows }) => {
    const head = rows[0];
    const editions = rows.map((r): MovedEdition => {
      const counts = stockAt.map(i => count(unguard(r[i] ?? ""))).filter((n): n is number => n !== null);
      const variation = c.get(r, "Variation Name");
      const picks = picksOf(optionNumbers.map(n => [c.get(r, `Option Name ${n}`), c.get(r, `Option Value ${n}`)]));
      return {
        name: rows.length === 1 && /^regular$/i.test(variation) ? "" : variation,
        ...prices(c.get(r, "Price"), c.get(r, "Online Sale Price"), false),
        stock: counts.length ? counts.reduce((t, n) => t + n, 0) : null, sku: c.get(r, "SKU"), weight: "", photoUrl: "", ...(picks ? { picks } : {}),
      };
    });
    const cells: Record<string, string> = { Title: c.get(head, "Item Name") };
    const description = htmlToDescription(c.get(head, "Description"));
    if (description) cells.Description = description;
    const categories = list(c.get(head, "Categories", "Category"));
    if (categories.length) cells.Categories = categories.join(";");
    const seoTitle = c.get(head, "SEO Title"), seoDescription = c.get(head, "SEO Description");
    if (seoTitle) cells["SEO title"] = seoTitle;
    if (seoDescription) cells["SEO description"] = seoDescription;
    const gtin = rows.length === 1 ? c.get(head, "GTIN") : "";
    if (gtin && validIsbn(gtin)) cells.ISBN = gtin;
    return book(line, cells, editions, [], [], []);
  });
}

// ── Plan 23.10: the other big shop builders' files ──
// Each groups a product line with the lines under it. Weights are left out: these files don't say whether they are in
// pounds or kilograms. Category cells that are only numbers (ids, not names) are left out too.

const yes = (v: string) => /^(y|yes|true|1)$/i.test(v.trim());
const no = (v: string) => /^(n|no|false|0)$/i.test(v.trim());
const named = (values: string[]) => values.filter(v => v && !/^\d+$/.test(v));
const hiddenNote = "This product was hidden in your old shop.";

/**
 * Choices written as "Type=Dropdown|Name=Size|Value=M" pairs, with any separator between them or none
 * ("…|Value=MType=Swatch|Name=Colour|Value=Silver[#cccccc]"); a swatch's colour code is dropped.
 */
function namedPairs(value: string): [string, string][] {
  return [...value.matchAll(/Name=([^|;\n]*)\|Value=((?:(?!Type=)[^|;\n])*)/g)].map(m => [m[1].trim(), m[2].replace(/\[#[0-9a-f]{3,8}\]\s*$/i, "").trim()]);
}

/** Choices written in a version's name: "[S]Size=Small,[CS]Colour=Blue:#0000FF". */
function bracketPairs(value: string): [string, string][] {
  return [...value.matchAll(/\[[A-Z]+\]([^=,[\]]+)=([^,[]*)/g)].map(m => [m[1].trim(), m[2].replace(/:#[0-9a-f]{3,8}$/i, "").trim()]);
}

/** Groups lines under the product line above them; `kind` says which a line is. */
function grouped(table: string[][], kind: (row: string[]) => "product" | "under" | "skip"): { line: number; head: string[]; under: string[][] }[] {
  const out: { line: number; head: string[]; under: string[][] }[] = [];
  table.slice(1).forEach((row, i) => {
    const k = kind(row);
    if (k === "product") out.push({ line: i + 2, head: row, under: [] });
    else if (k === "under" && out.length) out[out.length - 1].under.push(row);
  });
  return out;
}

function fromItemRows(table: string[][]): MovedBook[] {
  const c = columns(table[0]);
  const item = (row: string[]) => c.get(row, "Item").toLowerCase();
  return grouped(table, r => (item(r) === "product" ? "product" : item(r) === "variant" || item(r) === "image" ? "under" : "skip")).map(({ line, head, under }) => {
    const tracking = c.get(head, "Inventory Tracking").toLowerCase();
    const stockOf = (row: string[]) => (tracking === "none" ? null : count(c.get(row, "Current Stock")));
    const was = c.get(head, "Retail Price");
    const variants = under.filter(r => item(r) === "variant");
    const edition = (row: string[], pairs: [string, string][]): MovedEdition => {
      const own = prices(c.get(row, "Price") || c.get(head, "Price"), c.get(row, "Sale Price") || c.get(head, "Sale Price"), false);
      const regular = prices(String(own.price), was, true);
      const picks = picksOf(pairs);
      return {
        name: pairs.map(([, v]) => v).filter(Boolean).join(" / "), price: own.salePrice ? own.price : regular.price, salePrice: own.salePrice || regular.salePrice,
        stock: tracking === "variant" ? count(c.get(row, "Current Stock")) : null, sku: c.get(row, "SKU"), weight: "", photoUrl: https(c.get(row, "Variant Image URL")), ...(picks ? { picks } : {}),
      };
    };
    const editions = variants.length ? variants.map(v => edition(v, namedPairs(c.get(v, "Options")))) : [{ ...edition(head, []), stock: stockOf(head) }];
    const cells: Record<string, string> = { Title: c.get(head, "Name") };
    if (variants.length && tracking === "product") { const n = stockOf(head); if (n !== null) cells.Stock = String(n); }
    const description = htmlToDescription(c.get(head, "Description"));
    if (description) cells.Description = description;
    const categories = named(list(c.get(head, "Categories"), /[;,]/));
    if (categories.length) cells.Categories = categories.join(";");
    const seoTitle = c.get(head, "Page Title"), seoDescription = c.get(head, "Meta Description");
    if (seoTitle) cells["SEO title"] = seoTitle;
    if (seoDescription) cells["SEO description"] = seoDescription;
    const isbn = c.get(head, "Global Trade Number", "UPC/EAN");
    if (validIsbn(isbn)) cells.ISBN = isbn;
    const images = under.filter(r => item(r) === "image");
    const photos = [...images.filter(r => yes(c.get(r, "Image is Thumbnail"))), ...images.filter(r => !yes(c.get(r, "Image is Thumbnail")))].map(r => c.get(r, "Internal Image URL (Export)", "Image URL (Import)"));
    const path = c.get(head, "Product URL");
    return book(line, cells, editions, photos, path.startsWith("/") ? [path] : [], no(c.get(head, "Is Visible")) ? [hiddenNote] : []);
  });
}

/** A price rule on a version line: "[ADD]5", "[REMOVE]10%", "[FIXED]15". NaN when there is none. */
function ruled(rule: string, base: number): number {
  const m = /^\[(ADD|REMOVE|FIXED)\]\s*(-?[\d.,]+)\s*(%)?$/i.exec(rule.trim());
  if (!m || Number.isNaN(base)) return NaN;
  const n = parseMoney(m[2]), kind = m[1].toUpperCase();
  if (Number.isNaN(n)) return NaN;
  const by = m[3] ? (base * n) / 100 : n;
  const price = kind === "FIXED" ? n : kind === "ADD" ? base + by : base - by;
  return price >= 0 ? Math.round(price * 100) / 100 : NaN;
}

function fromSkuRows(table: string[][]): MovedBook[] {
  const c = columns(table[0]);
  const kind = (row: string[]) => c.get(row, "Item Type").toLowerCase();
  const photoAt = table[0].map((h, i) => (/^product image url \d+$/.test(key(h)) ? i : -1)).filter(i => i >= 0);
  return grouped(table, r => (kind(r) === "product" ? "product" : kind(r) === "sku" || kind(r) === "rule" ? "under" : "skip")).map(({ line, head, under }) => {
    const track = c.get(head, "Track Inventory").toLowerCase();
    const base = prices(c.get(head, "Price"), c.get(head, "Sale Price"), false);
    const versions: { row: string[]; price: number }[] = [];
    for (const row of under) {
      if (kind(row) === "sku") { versions.push({ row, price: base.price }); continue; }
      const name = c.get(row, "Product Name");
      const target = (name && versions.find(v => c.get(v.row, "Product Name") === name)) || versions[versions.length - 1];
      const price = target ? ruled(c.get(row, "Price"), base.price) : NaN;
      if (target && !Number.isNaN(price)) target.price = price;
    }
    const stockOf = (row: string[]) => (/none|^$/.test(track) && !c.get(row, "Current Stock Level") ? null : count(c.get(row, "Current Stock Level")));
    const editions: MovedEdition[] = versions.length
      ? versions.map(({ row, price }) => {
        const pairs = bracketPairs(c.get(row, "Product Name"));
        const picks = picksOf(pairs);
        return { name: pairs.map(([, v]) => v).join(" / "), price, salePrice: 0, stock: /option/.test(track) ? stockOf(row) : null, sku: c.get(row, "Product Code/SKU"), weight: "", photoUrl: "", ...(picks ? { picks } : {}) };
      })
      : [{ name: "", ...base, stock: stockOf(head), sku: c.get(head, "Product Code/SKU"), weight: "", photoUrl: "" }];
    const cells: Record<string, string> = { Title: c.get(head, "Product Name") };
    if (versions.length && /product/.test(track)) { const n = stockOf(head); if (n !== null) cells.Stock = String(n); }
    const description = htmlToDescription(c.get(head, "Product Description"));
    if (description) cells.Description = description;
    const categories = named(list(c.get(head, "Category"), /;/).map(p => p.split("/").pop()!.trim()));
    if (categories.length) cells.Categories = [...new Set(categories)].join(";");
    const seoTitle = c.get(head, "Page Title"), seoDescription = c.get(head, "Meta Description");
    if (seoTitle) cells["SEO title"] = seoTitle;
    if (seoDescription) cells["SEO description"] = seoDescription;
    const path = c.get(head, "Product URL");
    const photos = photoAt.map(i => unguard(head[i] ?? ""));
    return book(line, cells, editions, photos, path.startsWith("/") ? [path] : [], no(c.get(head, "Product Visible")) ? [hiddenNote] : []);
  });
}

function fromTypedRows(table: string[][], notices: string[]): MovedBook[] {
  const c = columns(table[0]);
  const kind = (row: string[]) => c.get(row, "type").toLowerCase();
  const optionAt = table[0].map((h, i) => ({ i, name: /^product_variation_option_(.+)$/i.exec(h.trim())?.[1]?.trim() ?? "" })).filter(o => o.name);
  const galleryAt = table[0].map((h, i) => (/^product media gallery image url\b/.test(key(h)) ? i : -1)).filter(i => i >= 0);
  const categoryAt = table[0].map((h, i) => (/^product category\b/.test(key(h)) ? i : -1)).filter(i => i >= 0);
  const products: { line: number; head: string[]; under: string[][] }[] = [];
  const byId = new Map<string, (typeof products)[number]>(), bySku = new Map<string, (typeof products)[number]>();
  const pending: string[][] = [];
  table.slice(1).forEach((row, i) => {
    if (kind(row) === "product") {
      const p = { line: i + 2, head: row, under: [] as string[][] };
      products.push(p);
      const id = c.get(row, "product_internal_id"), sku = c.get(row, "product_sku");
      if (id) byId.set(id, p);
      if (sku) bySku.set(sku, p);
    } else if (kind(row) === "product_variation") pending.push(row);
  });
  let strays = 0;
  for (const row of pending) {
    const p = byId.get(c.get(row, "product_internal_id")) ?? bySku.get(c.get(row, "product_sku"));
    if (p) p.under.push(row); else strays++;
  }
  if (strays) notices.push(`${strays} version line${strays === 1 ? "" : "s"} belonged to no product in the file, so ${strays === 1 ? "it was" : "they were"} left out.`);
  return products.map(({ line, head, under }) => {
    const tracked = !no(c.get(head, "product_is_inventory_tracked"));
    const edition = (row: string[], pairs: [string, string][]): MovedEdition => {
      const picks = picksOf(pairs);
      return {
        name: pairs.map(([, v]) => v).filter(Boolean).join(" / "),
        ...prices(c.get(row, "product_price") || c.get(head, "product_price"), c.get(row, "product_compare_to_price") || c.get(head, "product_compare_to_price"), true),
        stock: tracked ? count(c.get(row, "product_quantity")) : null, sku: c.get(row, "product_variation_sku") || (row === head ? c.get(head, "product_sku") : ""), weight: "", photoUrl: "", ...(picks ? { picks } : {}),
      };
    };
    const editions = under.length ? under.map(r => edition(r, optionAt.map(({ i, name }) => [name, unguard(r[i] ?? "")]))) : [edition(head, [])];
    const cells: Record<string, string> = { Title: c.get(head, "product_name") };
    const description = htmlToDescription(c.get(head, "product_description"));
    if (description) cells.Description = description;
    const categories = named(categoryAt.flatMap(i => list(unguard(head[i] ?? ""), /;/)).map(p => p.split("/").pop()!.trim()));
    if (categories.length) cells.Categories = [...new Set(categories)].join(";");
    const seoTitle = c.get(head, "product_seo_title"), seoDescription = c.get(head, "product_seo_description");
    if (seoTitle) cells["SEO title"] = seoTitle;
    if (seoDescription) cells["SEO description"] = seoDescription;
    const photos = [c.get(head, "product_media_main_image_url"), ...galleryAt.map(i => unguard(head[i] ?? ""))];
    let path = "";
    // A product address after "#" (shop.php#!/Mug/p/123) is the same page for every product, so it can't be kept.
    try { const url = c.get(head, "url"); path = url && !url.includes("#") ? new URL(url, "https://old.example").pathname : ""; } catch { path = ""; }
    return book(line, cells, editions, photos, path && path !== "/" ? [path] : [], no(c.get(head, "product_is_available")) ? [hiddenNote] : []);
  });
}

/** Reads another shop's product export. Null when the file isn't one (the plain spreadsheet import takes it). */
export function readProductExport(text: string): ProductMove | null {
  const table = parseCsv(text);
  if (!table.length) return null;
  const shape = recognizeExport(table[0]);
  if (!shape) return null;
  const notices: string[] = [];
  const books = shape === "handle-rows" ? fromHandleRows(table)
    : shape === "product-id-rows" ? fromProductIdRows(table)
    : shape === "parent-rows" ? fromParentRows(table, notices)
    : shape === "field-type-rows" ? fromFieldTypeRows(table, notices)
    : shape === "variation-name-rows" ? fromVariationNameRows(table, notices)
    : shape === "item-rows" ? fromItemRows(table)
    : shape === "sku-rows" ? fromSkuRows(table)
    : shape === "typed-rows" ? fromTypedRows(table, notices)
    : fromListingRows(table);
  const problems = books.length ? [] : ["This export has no products in it. Export your products again from your old shop, including every product, and choose that file."];
  if (books.length > MAX_IMPORT_ROWS) problems.push(`The export has ${books.length} products; bring over up to ${MAX_IMPORT_ROWS} at a time.`);
  const { has } = columns(table[0]);
  return { shape, books, problems, notices, blankIsUncounted: shape !== "handle-rows" || TRACKER.some(n => has(n)) };
}

const LABELS = ["Title", "Description", "ISBN", "SKU", "Price", "Sale price", "Stock", "Categories", "Tags", "Weight", "Image URL", "Extra image URLs", "SEO title", "SEO description"];
const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The products as a spreadsheet in this shop's own import columns, one line per book. */
export function movedBooksCsv(books: MovedBook[]): string {
  return [LABELS, ...books.map(b => LABELS.map(l => b.cells[l] ?? ""))].map(r => r.map(csvCell).join(",")).join("\n") + "\n";
}

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11));

/** The edition list a new book is saved with (the book editor's edition fields). */
export function editionsFor(moved: MovedBook): Record<string, any>[] {
  return moved.editions.map(e => ({
    id: newId(), name: e.name || "Edition", price: e.price, stock: e.stock ?? 0, stockLevel: e.stock ?? 0, sku: e.sku, weight: e.weight, photoUrl: e.photoUrl,
    // Each version's choices, so the product page shows a button per size and colour (plan 10.6).
    ...(moved.options.length && e.picks ? { options: { ...e.picks } } : {}),
  }));
}

export interface MovePlan { plan: ImportPlan; moved: ProductMove | null; oldPaths: Map<number, string[]> }

/**
 * The preview for any file chosen in Books › Import: another shop's export is read and translated first; anything
 * else goes to the spreadsheet import unchanged. Rows keep the old file's line numbers, and a new book sold in
 * several editions is created with them. With `keepOptions` (a shop that doesn't sell books), a product whose old
 * shop named its choices (Size, Colour) is created with them as options, so its page shows a button per value.
 */
export function planShopMove(text: string, books: any[], shopCategories: string[] = [], opts: ImportOptions = {}, { keepOptions = false }: { keepOptions?: boolean } = {}): MovePlan {
  const moved = readProductExport(text);
  if (!moved) return { plan: planImport(text, books, shopCategories, opts), moved: null, oldPaths: new Map() };
  if (moved.problems.length) return { plan: { rows: [], ignoredColumns: [], problems: moved.problems, counts: { create: 0, update: 0, unchanged: 0, error: 0 } }, moved, oldPaths: new Map() };
  const plan = planImport(movedBooksCsv(moved.books), books, shopCategories, opts);
  const lineOf = (csvLine: number) => moved.books[csvLine - 2]?.line ?? csvLine;
  const relabel = (s: string) => s.replace(/\bLine (\d+)\b/g, (_m, n) => `Line ${lineOf(Number(n))}`);
  const oldPaths = new Map<number, string[]>();
  const rows: ImportRow[] = plan.rows.map(row => {
    let m = moved.books[row.line - 2];
    const next: ImportRow = { ...row, line: m.line, errors: row.errors.map(relabel), warnings: [...row.warnings.map(relabel), ...m.notes] };
    if (m.oldPaths.length) oldPaths.set(m.line, m.oldPaths);
    // No stock number anywhere means the old shop didn't count this product ("Unlimited", stock not managed). Saved
    // with 0 copies and counting on, it would show as sold out here, so it comes over without stock counting. Not for
    // one-line-per-edition files: a file read from an old shop's address has that layout and leaves a stock count blank
    // because it isn't shown publicly, not because the old shop didn't count it (services/moving/oldShop.js).
    const blankMeansUncounted = moved.blankIsUncounted;
    if (blankMeansUncounted && row.action === "create" && !m.cells.Stock) {
      next.patch = { ...next.patch, trackInventory: false };
      next.warnings.push("Your old shop didn't count this product's stock, so it comes over without stock counting and never shows as sold out. To count copies, turn on stock counting in the book editor and type how many you have.");
    } else if (blankMeansUncounted && row.action === "create" && m.editions.length > 1) {
      const uncounted = m.editions.filter(e => e.stock === null).map(e => e.name || "Edition");
      if (uncounted.length) next.warnings.push(`Your old shop didn't count the stock of ${uncounted.join(", ")}, so ${uncounted.length === 1 ? "it starts" : "they start"} at 0 here and ${uncounted.length === 1 ? "shows" : "show"} as sold out. Type how many you have in the book editor.`);
    }
    if (m.editions.length > 1) {
      // A books shop keeps today's editions list: an old shop's "Format: Hardcover" stays an edition (plan 10.20).
      if (!keepOptions) m = { ...m, options: [] };
      const names = m.editions.map(e => e.name || "Edition").join("; ");
      if (row.action === "create") {
        next.patch = { ...next.patch, variants: editionsFor(m), ...(m.options.length ? { options: m.options } : {}) };
        next.changes = [...row.changes, { field: "variants", label: "Editions", from: "", to: names }];
        if (m.options.length) next.changes.push({ field: "options", label: "Options", from: "", to: m.options.map(o => `${o.name}: ${o.values.join(", ")}`).join("; ") });
      } else if (row.action !== "error") {
        next.warnings.push(`Editions (${names}) weren't added: this book is already in your shop, so add or change its editions in the book editor.`);
      }
    }
    return next;
  });
  return { plan: { ...plan, rows }, moved, oldPaths };
}

// ── Old links (plan 3.2) ──────────────────────────────────────────

export interface RedirectPlan {
  /** The whole list to save: what was there, then the new links. */
  items: Redirect[];
  added: Redirect[];
  /** Old addresses that already lead somewhere (left as the owner set them), or can't be used. */
  skipped: { from: string; why: string }[];
  /** Old addresses left out because the shop already keeps MAX_REDIRECTS old links (also listed in `skipped`). */
  full: number;
}

/** The line under a finished import about the old shop's links, in the owner's words. */
export function oldLinksMessage(links: { added: number; skipped: number; full: number; failed: boolean }): string {
  if (links.failed) return "The old shop links couldn't be saved. Import the same file again to retry; books already saved show as unchanged.";
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  let text = `${links.added} old shop link${plural(links.added, " now leads", "s now lead")} to ${plural(links.added, "its book", "their books")} (Settings › General › URL redirects).`;
  if (links.skipped) text += ` ${links.skipped} already led somewhere else and ${plural(links.skipped, "was", "were")} left as ${plural(links.skipped, "it was", "they were")}.`;
  if (links.full) text += ` Your shop is full: it keeps up to ${MAX_REDIRECTS.toLocaleString("en")} old links, so ${links.full.toLocaleString("en")} more ${plural(links.full, "wasn't", "weren't")} added. Delete old links you no longer need in URL redirects to make room.`;
  return text;
}

/** What the owner reads when the shop's old-link list is full. */
export const REDIRECTS_FULL_WHY = `Your shop is full: it keeps up to ${MAX_REDIRECTS.toLocaleString("en")} old links, so this one wasn't added.`;

/**
 * Redirects so the old shop's product links open the same book here once the press's address points at this shop.
 * Each book's link is its id (`/books/<id>`), which the book page always finds, even after the title changes.
 * A redirect the owner already has is never replaced, so bringing the same file over twice adds nothing.
 */
export function importRedirects(existing: Redirect[], links: { oldPaths: string[]; bookId: string }[]): RedirectPlan {
  const items = [...existing];
  const added: Redirect[] = [];
  const skipped: RedirectPlan["skipped"] = [];
  let full = 0;
  const index = redirectIndex(items);
  const saved = new Map<string, string>(); // normalised old address → its destination exactly as saved
  for (const r of items) { const f = normalizePath(r.from); if (!saved.has(f)) saved.set(f, r.to); }
  for (const { oldPaths, bookId } of links) {
    if (!bookId) continue;
    const to = productHref(encodeURIComponent(bookId));
    for (const path of oldPaths) {
      const from = normalizePath(path);
      const had = saved.get(from);
      if (had !== undefined) { if (had !== to) skipped.push({ from, why: `It already leads to ${had}.` }); continue; }
      // New links fill the list in order (saved as pages of 500, plan 5.6) until it is full.
      if (items.length >= MAX_REDIRECTS) { skipped.push({ from, why: REDIRECTS_FULL_WHY }); full += 1; continue; }
      const why = redirectProblemIn({ from, to }, index);
      if (why) { skipped.push({ from, why }); continue; }
      const item = { from, to };
      items.push(item); added.push(item);
      addToIndex(index, item); saved.set(from, to);
    }
  }
  return { items, added, skipped, full };
}

// ── Customers ─────────────────────────────────────────────────────

export interface MovedCustomer {
  line: number; email: string; name: string; place: string; tags: string[]; note: string;
  /** true: agreed to marketing email at the old shop; false: said no; null: the file doesn't say. */
  acceptsEmail: boolean | null;
  orders: number | null; spent: number | null;
}

export interface CustomerMove { customers: MovedCustomer[]; skipped: { line: number; reason: string }[]; problems: string[] }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads a customer list: another shop's customer export or any spreadsheet with an Email column. */
export function readCustomerExport(text: string): CustomerMove {
  const table = parseCsv(text);
  if (table.length < 2) return { customers: [], skipped: [], problems: ["The file has no customers in it. The first line must be the column headings (Email, First Name…), with one customer per line under it."] };
  const c = columns(table[0]);
  if (!c.has("Email") && !c.has("Email Address") && !c.has("E-mail")) return { customers: [], skipped: [], problems: ["There is no Email column, so the customers can't be matched. Export your customers again, or add an Email column."] };
  const consentHeading = ["Accepts Email Marketing", "Accepts Marketing", "Email Marketing", "Subscribed", "Newsletter", "Marketing Opt In", "Accepts Email"].find(h => c.has(h));
  // A mailing list from an email-list tool (plan 23.4): a Status column says who is still subscribed, or the file is a
  // list of sign-ups (an opt-in or confirm time per line), where being on it is the agreement, unless that line was
  // unsubscribed or cleaned off. The owner still confirms the permission before anyone joins.
  const statusHeading = ["Status", "Member Status", "Subscriber Status", "Subscription Status"].find(h => c.has(h));
  const signUps = !consentHeading && !statusHeading && ["OPTIN_TIME", "CONFIRM_TIME", "Opt-in Time", "Signup Date", "Subscribed At"].some(h => c.has(h));
  const seen = new Set<string>();
  const customers: MovedCustomer[] = [];
  const skipped: CustomerMove["skipped"] = [];
  table.slice(1).forEach((row, i) => {
    const line = i + 2;
    const email = c.get(row, "Email", "Email Address", "E-mail").toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) { skipped.push({ line, reason: email ? `“${email}” isn't an email address.` : "No email address." }); return; }
    if (seen.has(email)) { skipped.push({ line, reason: `${email} is already on an earlier line.` }); return; }
    seen.add(email);
    const name = c.get(row, "Name", "Full Name") || [c.get(row, "First Name", "Billing First Name"), c.get(row, "Last Name", "Billing Last Name")].filter(Boolean).join(" ");
    const place = [c.get(row, "Default Address City", "City", "Billing City"), c.get(row, "Default Address Province Code", "Province Code", "Province", "State", "Billing State"), c.get(row, "Default Address Country Code", "Country Code", "Country", "Billing Country")].filter(Boolean).join(", ");
    const consent = consentHeading ? c.get(row, consentHeading).toLowerCase() : "";
    const status = statusHeading ? c.get(row, statusHeading).toLowerCase() : "";
    const leftList = !!c.get(row, "UNSUB_TIME", "CLEAN_TIME", "Unsubscribed At");
    const acceptsEmail = consentHeading && consent ? /^(yes|y|true|1|subscribed|opted in|confirmed)$/.test(consent)
      : statusHeading && status ? /^(subscribed|active|confirmed|opted in)$/.test(status)
      : signUps ? !leftList
      : null;
    const orders = count(c.get(row, "Total Orders", "Orders", "Order Count"));
    const spentRaw = c.get(row, "Total Spent", "Total Spend", "Money Spent", "Spent");
    const spent = spentRaw ? money(spentRaw) : NaN;
    customers.push({ line, email, name, place, tags: parseTags(c.get(row, "Tags")), note: c.get(row, "Note", "Notes"), acceptsEmail, orders, spent: Number.isNaN(spent) ? null : spent });
  });
  return { customers, skipped, problems: customers.length ? [] : ["None of the lines had a usable email address."] };
}

/** The line that marks a note as brought over, so importing the same file twice changes nothing. */
export { MOVED_MARK };

/** `name` and `place` are stored beside the note so the customer is listed before their first order here (plan 23.10). */
export interface CustomerWrite { email: string; note: string; tags: string[]; name: string; place: string; action: "create" | "update" | "unchanged" }

/** Each customer's private note and tags (Customers › a customer › Notes), merged with what is already there. */
export function planCustomerNotes(customers: MovedCustomer[], existing: Map<string, { note: string; tags: string[]; name?: string; place?: string }>, today: string): CustomerWrite[] {
  return customers.map(cu => {
    const was = existing.get(cu.email);
    const facts = [
      cu.name, cu.place,
      cu.orders !== null ? `${cu.orders} order${cu.orders === 1 ? "" : "s"} there` : "",
      cu.spent !== null ? `${cu.spent.toFixed(2)} spent there` : "",
    ].filter(Boolean).join(" · ");
    const block = [`${MOVED_MARK} on ${today}${facts ? `: ${facts}` : "."}`, cu.note].filter(Boolean).join("\n");
    const tags = parseTags([...(was?.tags || []), ...cu.tags].join(","));
    const name = (was?.name || cu.name).slice(0, 100);
    const place = (was?.place || cu.place).slice(0, 200);
    if (was?.note.includes(MOVED_MARK)) {
      const same = tags.join(",") === (was.tags || []).join(",") && name === (was.name || "") && place === (was.place || "");
      return { email: cu.email, note: was.note, tags, name, place, action: same ? "unchanged" : "update" };
    }
    const note = (was?.note ? `${was.note}\n\n${block}` : block).slice(0, 5000);
    return { email: cu.email, note, tags, name, place, action: was ? "update" : "create" };
  });
}

/**
 * Who may join the newsletter: only customers the file says agreed to marketing email, who aren't on the list yet
 * and haven't opted out here. The owner still has to confirm they have that permission before any are added.
 */
export function newsletterJoiners(customers: MovedCustomer[], subscribed: Set<string>, optedOut: (email: string) => boolean): MovedCustomer[] {
  return customers.filter(cu => cu.acceptsEmail === true && !subscribed.has(cu.email) && !optedOut(cu.email));
}

/**
 * "Has this person opted out of marketing?" from the opt-out list (sha256 ids). When the list couldn't be read
 * (`null`), everyone counts as opted out, so a failed read can never add someone who unsubscribed.
 */
export function optedOutBy(hashes: Set<string> | null | undefined, hashOf: (email: string) => string | undefined): (email: string) => boolean {
  return (email) => !hashes || hashes.has(hashOf(email) || "");
}

export const IMPORTED_CONSENT_TEXT = "Agreed to email marketing at the shop's previous store. The owner brought the address over and confirmed they have this permission.";

export const SHAPE_WORDS: Record<ExportShape, string> = {
  "handle-rows": "an export from your old shop (one line per edition)",
  "product-id-rows": "an export from your old shop (a product line, then its options)",
  "parent-rows": "an export from your old shop (products with their variations)",
  "listing-rows": "a listings export from your old shop",
  "field-type-rows": "an export from your old shop (a product line, then its versions)",
  "variation-name-rows": "an item list from your old shop (one line per variation)",
  "item-rows": "an export from your old shop (a product line, then its versions and photos)",
  "sku-rows": "an export from your old shop (a product line, then its versions)",
  "typed-rows": "a catalog export from your old shop (products, then their versions)",
};
