// Books › Import CSV. Pure: parses a spreadsheet, matches each row to a catalog book and
// plans the changes. The caller previews the plan and writes it (BookImportDialog.tsx).
//
// Safety rules:
// - A blank cell keeps the book's current value; only values that differ are written.
// - Import never publishes. New books are created as drafts; a Status of "draft" can move a
//   book to draft, but going live always goes through the catalog's Publish review.
// - Rows are matched by ID, then ISBN, then SKU, then an exact, unique title. A row that
//   matches more than one book, or a book another row already changed, is refused.
// - Price and stock of books sold in editions are edited in the book editor, not here.

import { parseWeightGrams } from "../features/site/shippingEngine";
import { metricWeightValue } from "../features/site/metricWeight";

export type ImportField =
  | "id" | "title" | "subtitle" | "description" | "format" | "isbn" | "sku" | "status" | "isFeatured"
  | "retailPrice" | "salePrice" | "stockLevel" | "categories" | "publisher" | "publishDate"
  | "pageCount" | "edition" | "language" | "imageUrl"
  | "weight" | "saleStartsAt" | "saleEndsAt" | "tags" | "shippingProfileId" | "extraImages";

/** Spreadsheet headings each field accepts (compared lower-case, spaces and punctuation ignored). */
export const IMPORT_COLUMNS: { field: ImportField; label: string; aliases: string[] }[] = [
  { field: "id", label: "ID", aliases: ["id", "book id"] },
  { field: "title", label: "Title", aliases: ["title", "book title", "name"] },
  { field: "subtitle", label: "Author", aliases: ["author", "authors", "contributors", "author / contributors", "by"] },
  { field: "description", label: "Description", aliases: ["description", "blurb", "body"] },
  { field: "format", label: "Format", aliases: ["format", "binding"] },
  { field: "isbn", label: "ISBN", aliases: ["isbn", "isbn13", "isbn-13", "isbn 13", "barcode", "ean"] },
  { field: "sku", label: "SKU", aliases: ["sku"] },
  { field: "status", label: "Status", aliases: ["status"] },
  { field: "isFeatured", label: "Featured", aliases: ["featured"] },
  { field: "retailPrice", label: "Price", aliases: ["price", "retail price", "price cad", "price (cad)"] },
  { field: "salePrice", label: "Sale price", aliases: ["sale price", "sale", "sale price cad", "sale price (cad)"] },
  { field: "stockLevel", label: "Stock", aliases: ["stock", "quantity", "qty", "inventory", "stock level"] },
  { field: "categories", label: "Categories", aliases: ["categories", "category", "shop categories", "collections"] },
  { field: "publisher", label: "Publisher", aliases: ["publisher", "imprint"] },
  { field: "publishDate", label: "Publication date", aliases: ["publication date", "publish date", "pub date", "release date"] },
  { field: "pageCount", label: "Pages", aliases: ["pages", "page count", "number of pages"] },
  { field: "edition", label: "Edition", aliases: ["edition"] },
  { field: "language", label: "Language", aliases: ["language"] },
  { field: "imageUrl", label: "Image URL", aliases: ["image url", "image", "cover", "cover url", "photo", "photo url"] },
  { field: "weight", label: "Weight", aliases: ["weight", "shipping weight"] },
  { field: "saleStartsAt", label: "Sale starts", aliases: ["sale starts", "sale start", "sale start date", "sale from"] },
  { field: "saleEndsAt", label: "Sale ends", aliases: ["sale ends", "sale end", "sale end date", "sale until"] },
  { field: "tags", label: "Tags", aliases: ["tags", "tag", "keywords"] },
  { field: "shippingProfileId", label: "Shipping profile", aliases: ["shipping profile", "shipping profile id"] },
  { field: "extraImages", label: "Extra image URLs", aliases: ["extra image urls", "extra images", "more images", "additional images"] },
];

export const MAX_IMPORT_ROWS = 2000;

/** Values every new book starts with (the same as Books › Add book). */
export const NEW_BOOK_DEFAULTS = {
  title: "", subtitle: "", description: "", isbn: "", barcode: "", sku: "",
  retailPrice: 0, costPrice: 0, stockLevel: 0, format: "Paperback", dimensions: "", weight: "",
  language: "English", status: "draft", shippingProfileId: "", authorId: "", isFeatured: false,
  photos: [], slug: "", isOnSale: false, salePrice: 0, categories: [], tags: [], variants: [],
  scheduleDate: "", publisher: "", publishDate: "", pageCount: 0, edition: "", chargeTax: true,
  trackInventory: true, allowBackorder: false, preorder: false, metaTitle: "", metaDescription: "",
  saleStartsAt: "", saleEndsAt: "", addOns: [], bundleItems: [],
};

// ── CSV ───────────────────────────────────────────────────────────

/** Comma, semicolon (some Excel locales) or tab — whichever the header line uses most. */
function detectDelimiter(text: string): string {
  let header = "";
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    if (!quoted) header += ch;
  }
  const count = (d: string) => header.split(d).length - 1;
  return [",", ";", "\t"].reduce((best, d) => (count(d) > count(best) ? d : best), ",");
}

/** RFC 4180 CSV: quoted cells, doubled quotes, line breaks inside quotes, CRLF, a leading BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

const headingKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Which field each column feeds (null = ignored), plus the headings nobody recognised. */
export function mapHeadings(headings: string[]): { fields: (ImportField | null)[]; ignored: string[]; duplicates: string[] } {
  const seen = new Set<ImportField>();
  const ignored: string[] = [];
  const duplicates: string[] = [];
  const fields = headings.map(heading => {
    const key = headingKey(heading);
    const column = IMPORT_COLUMNS.find(c => c.aliases.some(a => headingKey(a) === key));
    if (!column) { if (heading.trim()) ignored.push(heading.trim()); return null; }
    if (seen.has(column.field)) { duplicates.push(heading.trim()); return null; }
    seen.add(column.field);
    return column.field;
  });
  return { fields, ignored, duplicates };
}

// ── Values ────────────────────────────────────────────────────────

/** Undo the export's spreadsheet-formula guard ('=…, '+…, '-…, '@…). */
const unguard = (value: string) => value.trim().replace(/^'([=+\-@\t\r])/, "$1");

export const normalizeIsbn = (value: unknown) => String(value ?? "").toUpperCase().replace(/[^0-9X]/g, "");

/** ISBN-10 or ISBN-13 with a correct check digit (hyphens and spaces ignored). */
export function validIsbn(value: string): boolean {
  const d = normalizeIsbn(value);
  if (/^\d{13}$/.test(d)) {
    const sum = [...d.slice(0, 12)].reduce((t, c, i) => t + Number(c) * (i % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(d[12]);
  }
  if (/^\d{9}[\dX]$/.test(d)) {
    const sum = [...d].reduce((t, c, i) => t + (c === "X" ? 10 : Number(c)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  return false;
}

/** "CA$12.50", "$12,50", "12.5" → 12.5. NaN when it isn't a price. */
export function parseMoney(value: string): number {
  let s = value.replace(/\s/g, "").replace(/^(CA|CAD|C)?\$/i, "").replace(/(CAD|\$)$/i, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100) / 100;
}

const YES = ["yes", "y", "true", "1", "featured", "x"];
const NO = ["no", "n", "false", "0", ""];

const splitList = (value: string) => [...new Set(value.split(/[;|]/).map(s => s.trim()).filter(Boolean))];

const sameList = (a: unknown, b: string[]) => {
  const x = Array.isArray(a) ? a.map(v => String(v).trim()) : [];
  return x.length === b.length && x.every((v, i) => v === b[i]);
};

const firstPhoto = (book: any): string => book?.photos?.[0]?.url || book?.photoUrl || "";
const hasEditions = (book: any) => Array.isArray(book?.variants) && book.variants.length > 0;

// ── Plan ──────────────────────────────────────────────────────────

export interface FieldChange { field: string; label: string; from: string; to: string }

export interface ImportRow {
  /** 1-based spreadsheet line (the heading is line 1). */
  line: number;
  action: "create" | "update" | "unchanged" | "error";
  title: string;
  bookId?: string;
  /** Fields to write: the new book (create) or the changed fields only (update). */
  patch: Record<string, any>;
  changes: FieldChange[];
  warnings: string[];
  errors: string[];
}

export interface ImportPlan {
  rows: ImportRow[];
  ignoredColumns: string[];
  /** File-level problems; when present nothing is imported. */
  problems: string[];
  counts: { create: number; update: number; unchanged: number; error: number };
}

const LABEL: Record<string, string> = Object.fromEntries(IMPORT_COLUMNS.map(c => [c.field, c.label]));
LABEL.photos = "Images";
LABEL.isOnSale = "On sale";

const show = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(v => (typeof v === "object" && v ? (v as any).url : String(v))).join("; ");
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  return String(value ?? "");
};

/**
 * `books` = the whole catalog. `shopCategories` = Studio's shop category names (a warning
 * names any category the storefront menu doesn't have yet; the book still gets it).
 */
export interface ImportOptions {
  /**
   * "leave" (default): a Stock number that differs from the live count is reported but not written; an
   * export file is a snapshot and sales since then would be undone. "set": the file's number is written.
   */
  stockMode?: "leave" | "set";
  /** Shipping profile IDs that exist (a warning names any other). */
  shippingProfiles?: string[];
  /** Books counted in the inventory app (Inventory › Inventory app link): their stock is never written. */
  linkedBookIds?: string[];
}

const isHttps = (value: string) => { try { return new URL(value).protocol === "https:"; } catch { return false; } };
const randomId = () => Math.random().toString(36).slice(2, 11);

export function planImport(text: string, books: any[], shopCategories: string[] = [], opts: ImportOptions = {}): ImportPlan {
  const stockMode = opts.stockMode || "leave";
  const empty = (problems: string[]): ImportPlan => ({ rows: [], ignoredColumns: [], problems, counts: { create: 0, update: 0, unchanged: 0, error: 0 } });
  const table = parseCsv(text);
  if (table.length < 2) return empty(["The file has no book rows. The first line must be the column headings (Title, ISBN, Price…), with one book per line under it."]);
  const { fields, ignored, duplicates } = mapHeadings(table[0]);
  const problems: string[] = [];
  if (!fields.some(Boolean)) problems.push("None of the column headings were recognised. Use headings such as Title, Author, ISBN, Price and Stock (the Export CSV file is a ready-made template).");
  if (duplicates.length) problems.push(`These columns appear twice: ${duplicates.join(", ")}. Remove the extra copy and try again.`);
  if (table.length - 1 > MAX_IMPORT_ROWS) problems.push(`The file has ${table.length - 1} rows; import up to ${MAX_IMPORT_ROWS} at a time.`);
  if (problems.length) return { ...empty(problems), ignoredColumns: ignored };

  const byId = new Map(books.map(b => [String(b.id), b]));
  const index = (key: (b: any) => string) => {
    const map = new Map<string, any[]>();
    for (const b of books) { const k = key(b); if (k) map.set(k, [...(map.get(k) || []), b]); }
    return map;
  };
  const byIsbn = index(b => normalizeIsbn(b.isbn));
  const bySku = index(b => String(b.sku || "").trim().toLowerCase());
  const byTitle = index(b => String(b.title || "").trim().toLowerCase());
  const known = new Set(shopCategories.map(c => c.trim().toLowerCase()));
  const claimed = new Map<string, number>();
  const newKeys = new Map<string, number>();

  const rows: ImportRow[] = table.slice(1).map((cells, i) => {
    const line = i + 2;
    const value: Partial<Record<ImportField, string>> = {};
    fields.forEach((field, col) => { if (field) value[field] = unguard(cells[col] ?? ""); });
    const errors: string[] = [];
    const warnings: string[] = [];
    const given = (f: ImportField) => (value[f] ?? "") !== "";

    // Which book is this?
    let book: any = null;
    const pick = (list: any[] | undefined, what: string) => {
      if (!list?.length) return null;
      if (list.length > 1) { errors.push(`${what} matches ${list.length} books (${list.map(b => b.title || "Untitled").join(", ")}). Add the ID column to say which one.`); return null; }
      return list[0];
    };
    if (given("id")) {
      book = byId.get(value.id!) || null;
      if (!book) errors.push(`No book has the ID “${value.id}”. Leave ID blank to add a new book.`);
    } else if (given("isbn") && normalizeIsbn(value.isbn)) {
      book = pick(byIsbn.get(normalizeIsbn(value.isbn)), `ISBN ${value.isbn}`);
    }
    if (!book && !errors.length && given("sku")) book = pick(bySku.get(value.sku!.toLowerCase()), `SKU ${value.sku}`);
    if (!book && !errors.length && !given("isbn") && !given("sku") && given("title")) book = pick(byTitle.get(value.title!.toLowerCase()), `The title “${value.title}”`);

    if (book) {
      const earlier = claimed.get(book.id);
      if (earlier) errors.push(`Line ${earlier} already changes this book. Keep one line per book.`);
      else claimed.set(book.id, line);
    } else if (!errors.length) {
      const key = given("isbn") && normalizeIsbn(value.isbn) ? `isbn:${normalizeIsbn(value.isbn)}` : given("sku") ? `sku:${value.sku!.toLowerCase()}` : "";
      if (key && newKeys.has(key)) errors.push(`Line ${newKeys.get(key)} already adds a book with this ${key.startsWith("isbn") ? "ISBN" : "SKU"}.`);
      else if (key) newKeys.set(key, line);
    }
    const creating = !book && !errors.length;
    if (creating && !given("title")) errors.push("A new book needs a Title.");

    // Values → book fields.
    const next: Record<string, any> = {};
    const text = (f: ImportField, field: string = f) => { if (given(f)) next[field] = value[f]!; };
    text("title"); text("subtitle"); text("description"); text("format"); text("sku"); text("publisher"); text("edition"); text("language");
    if (given("weight")) {
      if (parseWeightGrams(value.weight) === null) errors.push(`Weight “${value.weight}” must be a number in g or kg, e.g. 450 g.`);
      // Imperial values in an older file are still understood and saved in grams.
      else next.weight = metricWeightValue(value.weight!);
    }
    for (const f of ["saleStartsAt", "saleEndsAt"] as const) {
      if (!given(f)) continue;
      const s = value[f]!;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T12:00:00Z`))) errors.push(`${LABEL[f]} “${s}” must be written YYYY-MM-DD, e.g. 2026-11-12.`);
      else next[f] = s;
    }
    if (given("tags")) next.tags = splitList(value.tags!);
    if (given("shippingProfileId")) {
      next.shippingProfileId = value.shippingProfileId!;
      if (opts.shippingProfiles?.length && !opts.shippingProfiles.includes(value.shippingProfileId!))
        warnings.push(`Shipping profile “${value.shippingProfileId}” doesn't exist. Use a profile ID from Settings › Shipping.`);
    }
    if (given("isbn")) {
      next.isbn = value.isbn!;
      if (!validIsbn(value.isbn!)) warnings.push(`“${value.isbn}” isn't a valid ISBN-10 or ISBN-13 (check the digits). It is saved as typed, but Google won't use it as a barcode.`);
    }
    if (given("retailPrice")) {
      const n = parseMoney(value.retailPrice!);
      if (Number.isNaN(n)) errors.push(`Price “${value.retailPrice}” isn't a number.`); else next.retailPrice = n;
    }
    if (given("salePrice")) {
      const n = parseMoney(value.salePrice!);
      if (Number.isNaN(n)) errors.push(`Sale price “${value.salePrice}” isn't a number.`);
      else { next.salePrice = n; next.isOnSale = n > 0; }
    }
    if (given("stockLevel")) {
      const s = value.stockLevel!.replace(/[\s,]/g, "");
      if (!/^\d+$/.test(s)) errors.push(`Stock “${value.stockLevel}” must be a whole number of copies (0 or more).`); else next.stockLevel = Number(s);
    }
    if (given("pageCount")) {
      const s = value.pageCount!.replace(/[\s,]/g, "");
      if (!/^\d+$/.test(s) || Number(s) < 1) errors.push(`Pages “${value.pageCount}” must be a whole number.`); else next.pageCount = Number(s);
    }
    if (given("publishDate")) {
      const s = value.publishDate!;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T12:00:00Z`))) errors.push(`Publication date “${s}” must be written YYYY-MM-DD, e.g. 2026-11-12.`);
      else next.publishDate = s;
    }
    if (given("isFeatured")) {
      const s = value.isFeatured!.toLowerCase();
      if (YES.includes(s)) next.isFeatured = true;
      else if (NO.includes(s)) next.isFeatured = false;
      else errors.push(`Featured “${value.isFeatured}” must be yes or no.`);
    }
    if (given("categories")) {
      next.categories = splitList(value.categories!);
      const missing = next.categories.filter((c: string) => known.size && !known.has(c.toLowerCase()));
      if (missing.length) warnings.push(`${missing.join(", ")} ${missing.length === 1 ? "isn't a shop category" : "aren't shop categories"} yet, so ${missing.length === 1 ? "it won't" : "they won't"} show in the storefront menu. Add ${missing.length === 1 ? "it" : "them"} in Design › Menus › Shop categories.`);
    }
    if (given("status")) {
      const s = value.status!.toLowerCase();
      if (s === "draft" || s === "drafts") next.status = "draft";
      else if (!["published", "publish", "active", "live", "scheduled", "sold out", "archived"].includes(s)) errors.push(`Status “${value.status}” must be draft or published.`);
      else if (book?.status === "draft" || creating) warnings.push("Import doesn't publish books. After importing, select the book in the catalog and choose Publish, which checks it first.");
    }
    if (given("imageUrl")) {
      let url = "";
      try { const u = new URL(value.imageUrl!); url = u.protocol === "https:" ? u.href : ""; } catch { /* below */ }
      if (!url) errors.push(`Image URL “${value.imageUrl}” must be a full https:// web address.`);
      else if (book && firstPhoto(book) && firstPhoto(book) !== url) warnings.push("This book already has photos, so the Image URL was not used. Change photos in the book editor.");
      else if (!book || !firstPhoto(book)) next.photos = [{ url, altText: "" }];
    }
    if (given("extraImages")) {
      const urls = [...new Set(value.extraImages!.split("|").map(u => u.trim()).filter(Boolean))];
      const bad = urls.filter(u => !isHttps(u));
      if (bad.length) errors.push(`Extra image URLs must be full https:// web addresses separated by “|” (check ${bad.slice(0, 2).join(", ")}).`);
      else {
        const current: any[] = Array.isArray(book?.photos) ? book.photos : [];
        const cover = next.photos?.[0] || current[0] || null;
        const extras = urls.filter(u => u !== cover?.url).map(u => current.find(p => p?.url === u) || { id: randomId(), url: u, altText: "" });
        const list = cover ? [cover, ...extras] : extras;
        if (show(list) !== show(current)) next.photos = list;
      }
    }
    if (book && hasEditions(book)) {
      const fields = ["retailPrice", "salePrice", "stockLevel"].filter(f => f in next && show(next[f]) !== show(book[f] ?? ""));
      if (fields.length) warnings.push(`${fields.map(f => LABEL[f]).join(" and ")} ${fields.length === 1 ? "wasn't" : "weren't"} changed: this book is sold in editions, so prices and stock are set per edition in the book editor.`);
      for (const f of ["retailPrice", "salePrice", "isOnSale", "stockLevel"]) delete next[f];
    }
    if (book && "stockLevel" in next && (opts.linkedBookIds || []).includes(book.id)) {
      const live = String(book.stockLevel ?? "");
      if (show(next.stockLevel) !== show(live)) warnings.push("Stock not changed: this book is counted in the inventory app, and the website follows that count.");
      delete next.stockLevel;
    }
    if (book && "stockLevel" in next) {
      const live = book.stockLevel === undefined || book.stockLevel === null || book.stockLevel === "" ? null : Number(book.stockLevel);
      if (live !== next.stockLevel) {
        const shown = live === null ? "blank" : String(live);
        if (stockMode === "set") warnings.push(`Stock ${shown} → ${next.stockLevel} (live is ${shown}, file says ${next.stockLevel}).`);
        else {
          warnings.push(`Stock not changed: live is ${shown}, file says ${next.stockLevel}. Choose “Set stock to the file's numbers” to use it.`);
          delete next.stockLevel;
        }
      }
    }

    const title = String(next.title ?? book?.title ?? value.title ?? "Untitled");
    if (errors.length) return { line, action: "error", title, bookId: book?.id, patch: {}, changes: [], warnings, errors };

    if (creating) {
      if (!("retailPrice" in next)) warnings.push("No price given. The book is saved as a draft; add a price before publishing.");
      const patch = { ...NEW_BOOK_DEFAULTS, ...next, status: "draft" };
      const changes = Object.keys(next).map(f => ({ field: f, label: LABEL[f] || f, from: "", to: show(next[f]) }));
      return { line, action: "create", title, patch, changes, warnings, errors };
    }

    const patch: Record<string, any> = {};
    const changes: FieldChange[] = [];
    for (const [f, v] of Object.entries(next)) {
      const current = f === "isFeatured" ? (book.isFeatured ?? book.featured ?? false) : book[f];
      const same = f === "categories" ? sameList(book.categories ?? book.genres, v)
        : typeof v === "number" ? current !== undefined && current !== null && current !== "" && Number(current) === v
        : show(current ?? "") === show(v);
      if (same) continue;
      patch[f] = v;
      if (f === "isFeatured") patch.featured = v;
      changes.push({ field: f, label: LABEL[f] || f, from: show(current ?? ""), to: show(v) });
    }
    return { line, action: changes.length ? "update" : "unchanged", title, bookId: book.id, patch, changes, warnings, errors };
  });

  const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
  rows.forEach(r => counts[r.action]++);
  return { rows, ignoredColumns: ignored, problems: [], counts };
}

/** Headings-only file the owner can fill in (Export CSV is the full template). */
export function importTemplateCsv(): string {
  return IMPORT_COLUMNS.map(c => c.label).join(",") + "\n";
}
