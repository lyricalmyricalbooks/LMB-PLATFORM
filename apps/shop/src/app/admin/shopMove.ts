// Bring your shop with you (plan 3.1). Pure: reads the product or customer export another shop system gives a press,
// and turns it into what this shop's own importers take. Books go through the same preview and safety rules as
// Books › Import CSV (catalogImport.ts): matched by ISBN, then SKU, then title; new books are drafts; import never
// publishes. Customers become private notes and tags, and newsletter subscribers only with the owner's say-so.
//
// The words a press sees never name another shop system: a file is "an export from your old shop". The shapes below
// are told apart by their column headings only, so an unknown file falls back to the plain spreadsheet import.

import { metricWeightValue } from "../features/site/metricWeight";
import { MAX_IMPORT_ROWS, parseCsv, parseMoney, planImport, validIsbn, type ImportOptions, type ImportPlan, type ImportRow } from "./catalogImport";
import { parseTags } from "./customerInsights";
import { MAX_REDIRECTS, normalizePath, redirectProblem, type Redirect } from "../features/site/redirects";

/** Which shape an export has. Named after how its rows are laid out, not after who made it. */
export type ExportShape =
  | "handle-rows"     // one line per edition, grouped by a Handle column; photos on their own lines
  | "product-id-rows" // a product line, then one line per extra edition with a blank title
  | "parent-rows"     // product lines with Type simple/variable; editions are "variation" lines pointing at a Parent
  | "listing-rows";   // one line per listing with numbered photo columns (IMAGE1…)

export interface MovedEdition { name: string; price: number; salePrice: number; stock: number | null; sku: string; weight: string; photoUrl: string }

/** One product from the old shop, in this shop's import columns (catalogImport IMPORT_COLUMNS labels). */
export interface MovedBook {
  /** The file line the product starts on (the heading is line 1). */
  line: number;
  cells: Record<string, string>;
  /** Two or more when the product was sold in several versions (hardcover, signed copy…). */
  editions: MovedEdition[];
  /** The product's addresses on the old shop, for the redirects that keep old links working (plan 3.2). */
  oldPaths: string[];
  notes: string[];
}

export interface ProductMove {
  shape: ExportShape;
  books: MovedBook[];
  problems: string[];
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
    return { line, cells: out, editions: [], oldPaths, notes };
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
    return { line, cells: out, editions: kept, oldPaths, notes };
  }
  return { line, cells: out, editions: [], oldPaths, notes };
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

function fromHandleRows(table: string[][]): MovedBook[] {
  const c = columns(table[0]);
  // "Barcode" became "Barcodes"; a file that has both is read from Barcodes.
  const BARCODE = c.has("Barcodes") ? ["Barcodes"] : ["Variant Barcode", "Barcode"];
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
      const p = prices(c.get(r, ...PRICE), c.get(r, ...WAS_PRICE), true);
      const variantImage = c.get(r, ...EDITION_PHOTO);
      editions.push({ name, ...p, stock: count(c.get(r, ...STOCK)), sku: c.get(r, ...SKU), weight: grams(c.get(r, ...GRAMS)), photoUrl: https(variantImage) });
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
    return book(line, cells, editions, photos.sort((a, b) => a.at - b.at).map(p => p.url), [`/products/${handle}`]);
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
      return { name: optionHeads.map(h => c.get(r, h)).filter(Boolean).join(" / "), ...p, stock, sku: c.get(r, "SKU"), weight: "", photoUrl: "" };
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
    const editionRow = (r: string[], name: string): MovedEdition => ({ name, ...prices(c.get(r, "Regular price"), c.get(r, "Sale price"), false), stock: count(c.get(r, "Stock")), sku: c.get(r, "SKU"), weight: weight(r), photoUrl: https(list(c.get(r, "Images"))[0] || "") });
    const editions = vs.length
      ? vs.map(v => editionRow(v, attributeHeads.map(h => c.get(v, h)).filter(Boolean).join(" / ") || c.get(v, "Name")))
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
    : fromListingRows(table);
  const problems = books.length ? [] : ["This export has no products in it. Export your products again from your old shop, including every product, and choose that file."];
  if (books.length > MAX_IMPORT_ROWS) problems.push(`The export has ${books.length} products; bring over up to ${MAX_IMPORT_ROWS} at a time.`);
  return { shape, books, problems, notices };
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
  }));
}

export interface MovePlan { plan: ImportPlan; moved: ProductMove | null; oldPaths: Map<number, string[]> }

/**
 * The preview for any file chosen in Books › Import: another shop's export is read and translated first; anything
 * else goes to the spreadsheet import unchanged. Rows keep the old file's line numbers, and a new book sold in
 * several editions is created with them.
 */
export function planShopMove(text: string, books: any[], shopCategories: string[] = [], opts: ImportOptions = {}): MovePlan {
  const moved = readProductExport(text);
  if (!moved) return { plan: planImport(text, books, shopCategories, opts), moved: null, oldPaths: new Map() };
  if (moved.problems.length) return { plan: { rows: [], ignoredColumns: [], problems: moved.problems, counts: { create: 0, update: 0, unchanged: 0, error: 0 } }, moved, oldPaths: new Map() };
  const plan = planImport(movedBooksCsv(moved.books), books, shopCategories, opts);
  const lineOf = (csvLine: number) => moved.books[csvLine - 2]?.line ?? csvLine;
  const relabel = (s: string) => s.replace(/\bLine (\d+)\b/g, (_m, n) => `Line ${lineOf(Number(n))}`);
  const oldPaths = new Map<number, string[]>();
  const rows: ImportRow[] = plan.rows.map(row => {
    const m = moved.books[row.line - 2];
    const next: ImportRow = { ...row, line: m.line, errors: row.errors.map(relabel), warnings: [...row.warnings.map(relabel), ...m.notes] };
    if (m.oldPaths.length) oldPaths.set(m.line, m.oldPaths);
    if (m.editions.length > 1) {
      const names = m.editions.map(e => e.name || "Edition").join("; ");
      if (row.action === "create") {
        next.patch = { ...row.patch, variants: editionsFor(m) };
        next.changes = [...row.changes, { field: "variants", label: "Editions", from: "", to: names }];
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
}

/**
 * Redirects so the old shop's product links open the same book here once the press's address points at this shop.
 * Each book's link is its id (`/books/<id>`), which the book page always finds, even after the title changes.
 * A redirect the owner already has is never replaced, so bringing the same file over twice adds nothing.
 */
export function importRedirects(existing: Redirect[], links: { oldPaths: string[]; bookId: string }[]): RedirectPlan {
  const items = [...existing];
  const added: Redirect[] = [];
  const skipped: RedirectPlan["skipped"] = [];
  for (const { oldPaths, bookId } of links) {
    if (!bookId) continue;
    const to = `/books/${encodeURIComponent(bookId)}`;
    for (const path of oldPaths) {
      const from = normalizePath(path);
      const had = items.find(r => normalizePath(r.from) === from);
      if (had) { if (had.to !== to) skipped.push({ from, why: `It already leads to ${had.to}.` }); continue; }
      if (items.length >= MAX_REDIRECTS) { skipped.push({ from, why: `The shop holds up to ${MAX_REDIRECTS} old links.` }); continue; }
      const why = redirectProblem({ from, to }, items);
      if (why) { skipped.push({ from, why }); continue; }
      const item = { from, to };
      items.push(item); added.push(item);
    }
  }
  return { items, added, skipped };
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
    const acceptsEmail = !consentHeading || !consent ? null : /^(yes|y|true|1|subscribed|opted in|confirmed)$/.test(consent) ? true : false;
    const orders = count(c.get(row, "Total Orders", "Orders", "Order Count"));
    const spentRaw = c.get(row, "Total Spent", "Total Spend", "Money Spent", "Spent");
    const spent = spentRaw ? money(spentRaw) : NaN;
    customers.push({ line, email, name, place, tags: parseTags(c.get(row, "Tags")), note: c.get(row, "Note", "Notes"), acceptsEmail, orders, spent: Number.isNaN(spent) ? null : spent });
  });
  return { customers, skipped, problems: customers.length ? [] : ["None of the lines had a usable email address."] };
}

/** The line that marks a note as brought over, so importing the same file twice changes nothing. */
export const MOVED_MARK = "Brought over from your old shop";

export interface CustomerWrite { email: string; note: string; tags: string[]; action: "create" | "update" | "unchanged" }

/** Each customer's private note and tags (Customers › a customer › Notes), merged with what is already there. */
export function planCustomerNotes(customers: MovedCustomer[], existing: Map<string, { note: string; tags: string[] }>, today: string): CustomerWrite[] {
  return customers.map(cu => {
    const was = existing.get(cu.email);
    const facts = [
      cu.name, cu.place,
      cu.orders !== null ? `${cu.orders} order${cu.orders === 1 ? "" : "s"} there` : "",
      cu.spent !== null ? `${cu.spent.toFixed(2)} spent there` : "",
    ].filter(Boolean).join(" · ");
    const block = [`${MOVED_MARK} on ${today}${facts ? `: ${facts}` : "."}`, cu.note].filter(Boolean).join("\n");
    const tags = parseTags([...(was?.tags || []), ...cu.tags].join(","));
    if (was?.note.includes(MOVED_MARK)) {
      const same = tags.join(",") === (was.tags || []).join(",");
      return { email: cu.email, note: was.note, tags, action: same ? "unchanged" : "update" };
    }
    const note = (was?.note ? `${was.note}\n\n${block}` : block).slice(0, 5000);
    return { email: cu.email, note, tags, action: was ? "update" : "create" };
  });
}

/**
 * Who may join the newsletter: only customers the file says agreed to marketing email, who aren't on the list yet
 * and haven't opted out here. The owner still has to confirm they have that permission before any are added.
 */
export function newsletterJoiners(customers: MovedCustomer[], subscribed: Set<string>, optedOut: (email: string) => boolean): MovedCustomer[] {
  return customers.filter(cu => cu.acceptsEmail === true && !subscribed.has(cu.email) && !optedOut(cu.email));
}

export const IMPORTED_CONSENT_TEXT = "Agreed to email marketing at the shop's previous store. The owner brought the address over and confirmed they have this permission.";

export const SHAPE_WORDS: Record<ExportShape, string> = {
  "handle-rows": "an export from your old shop (one line per edition)",
  "product-id-rows": "an export from your old shop (a product line, then its options)",
  "parent-rows": "an export from your old shop (products with their variations)",
  "listing-rows": "a listings export from your old shop",
};
