// Download your shop (code plan 29): one zip with everything a press needs to leave. Pure, tested.
// Products come in the layouts four common shop systems import (the same layouts shopMove.ts reads, so a file made here
// also comes straight back in: shopTakeout.test.ts round-trips each one), customers and orders as spreadsheets, pages and
// settings as JSON, a full copy of the books as JSON, and every product photo. Screen words never name another system
// (the Settings card and the cancel step say "another shop system"); the files inside the zip are named for the system
// that reads them, because that is what the press looks for when it gets there.
import { saleActive } from "../../shared/promotions";
import { productOptions, usesOptionPicker, variantPicks } from "../../shared/productOptions";
import { parseWeightGrams } from "../../shared/weightGrams";
import { customersForAnotherShop, descriptionToHtml, isDigital, money, photosOf, productsForAnotherShop, slugOf, type Consent } from "./shopExport";
import { exportOrdersCsv } from "./orderCsv";

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;
const sheet = (headings: readonly string[], lines: Record<string, string>[]) =>
  `${[headings.map(cell).join(","), ...lines.map((line) => headings.map((h) => cell(line[h])).join(","))].join("\n")}\n`;

/** One edition of a book as every layout needs it. A book without editions has one, with no name. */
interface Edition { name: string; price: string; was: string; sku: string; stock: string; kg: string; barcode: string; picks: Record<string, string> | null; option: string }

const kgOf = (weight: unknown) => { const g = parseWeightGrams(weight); return g && g > 0 ? String(Math.round(g) / 1000) : ""; };

export function editionsOf(b: any, now: Date): Edition[] {
  const tracked = b.trackInventory !== false;
  const variants = (Array.isArray(b.variants) ? b.variants : []).filter((v: any) => v && v.price !== undefined && v.price !== null && v.price !== "");
  const onSale = saleActive(b, now) && Number(b.salePrice) > 0 && Number(b.salePrice) < Number(b.retailPrice);
  if (!variants.length) {
    return [{ name: "", price: money(b.retailPrice ?? 0), was: onSale ? money(b.salePrice) : "", sku: String(b.sku || ""), stock: tracked ? String(Math.max(0, Number(b.stockLevel ?? 0) || 0)) : "", kg: kgOf(b.weight), barcode: String(b.isbn || b.barcode || ""), picks: null, option: "" }];
  }
  const options = usesOptionPicker(b) ? productOptions(b) : [];
  return variants.map((v: any) => ({
    name: String(v.name || "Edition"), price: money(v.price), was: "", sku: String(v.sku || b.sku || ""),
    stock: tracked ? String(Math.max(0, Number(v.stock ?? v.stockLevel ?? 0) || 0)) : "", kg: kgOf(v.weight || b.weight), barcode: String(v.isbn || v.barcode || ""),
    picks: options.length ? variantPicks(v, options) : null, option: String(v.name || "Edition"),
  }));
}

/** A unique address for each book, the same in every file (a book titled like another gets -2). */
export function handlesFor(books: any[]): Map<any, string> {
  const used = new Set<string>();
  const out = new Map<any, string>();
  for (const b of books) {
    let handle = slugOf(b);
    for (let n = 2; used.has(handle); n++) handle = `${slugOf(b)}-${n}`;
    used.add(handle);
    out.set(b, handle);
  }
  return out;
}

const sellable = (books: any[]) => books.filter((b) => b && b.productType !== "giftCard");
const categoriesOf = (b: any): string[] => (Array.isArray(b.categories) ? b.categories : Array.isArray(b.genres) ? b.genres : []).map(String);
const tagsOf = (b: any): string[] => (Array.isArray(b.tags) ? b.tags : []).map(String);

// ── WooCommerce: lines marked simple/variable, editions as "variation" lines under a Parent ──

export const WOO_HEADINGS = ["ID", "Type", "SKU", "Name", "Published", "Short description", "Description", "In stock?", "Stock", "Regular price", "Sale price", "Weight (kg)", "Categories", "Tags", "Images", "Parent", "Attribute 1 name", "Attribute 1 value(s)", "Attribute 1 visible", "Attribute 1 global"] as const;

export function productsForWoo(books: any[], { now = new Date() }: { now?: Date } = {}): string {
  const lines: Record<string, string>[] = [];
  let id = 100;
  for (const b of sellable(books)) {
    const editions = editionsOf(b, now);
    const several = editions.length > 1;
    const parent = String(++id);
    const photos = photosOf(b).map((p) => p.url).join(", ");
    const published = String(b.status || "published") === "published" ? "1" : "0";
    const head: Record<string, string> = {
      ID: parent, Type: several ? "variable" : "simple", Name: String(b.title || ""), Published: published,
      Description: descriptionToHtml(b.description || ""), Categories: categoriesOf(b).join(", "), Tags: tagsOf(b).join(", "), Images: photos,
    };
    if (several) {
      Object.assign(head, { "Attribute 1 name": "Edition", "Attribute 1 value(s)": editions.map((e) => e.name).join(", "), "Attribute 1 visible": "1", "Attribute 1 global": "0" });
      lines.push(head);
      for (const e of editions) lines.push({ Type: "variation", SKU: e.sku, Name: `${b.title} - ${e.name}`, Published: "1", "In stock?": e.stock === "" || Number(e.stock) > 0 ? "1" : "0", Stock: e.stock, "Regular price": e.price, "Weight (kg)": e.kg, Parent: `id:${parent}`, "Attribute 1 name": "Edition", "Attribute 1 value(s)": e.name });
    } else {
      const e = editions[0];
      Object.assign(head, { SKU: e.sku, "In stock?": e.stock === "" || Number(e.stock) > 0 ? "1" : "0", Stock: e.stock, "Regular price": e.price, "Sale price": e.was, "Weight (kg)": e.kg });
      lines.push(head);
    }
  }
  return sheet(WOO_HEADINGS, lines);
}

// ── Squarespace: a line per edition under one Product ID; the product's details on its first line ──

export const SQUARESPACE_HEADINGS = ["Product ID [Non Editable]", "Variant ID [Non Editable]", "Product Type [Non Editable]", "Product Page", "Product URL", "Title", "Description", "SKU", "Option Name 1", "Option Value 1", "Price", "Sale Price", "On Sale", "Stock", "Categories", "Tags", "Hosted Image URLs", "Visible"] as const;

export function productsForSquarespace(books: any[], { now = new Date() }: { now?: Date } = {}): string {
  const lines: Record<string, string>[] = [];
  const handles = handlesFor(sellable(books));
  let n = 0;
  for (const b of sellable(books)) {
    const pid = `p${String(++n).padStart(5, "0")}`;
    editionsOf(b, now).forEach((e, i) => {
      const onSale = e.was !== "";
      const line: Record<string, string> = {
        "Product ID [Non Editable]": pid, "Variant ID [Non Editable]": `${pid}-${i + 1}`, SKU: e.sku,
        "Option Name 1": e.name ? "Edition" : "", "Option Value 1": e.name,
        Price: e.price, "Sale Price": e.was, "On Sale": onSale ? "Yes" : "No", Stock: e.stock === "" ? "Unlimited" : e.stock,
      };
      if (i === 0) {
        Object.assign(line, {
          "Product Type [Non Editable]": isDigital(b) ? "SERVICE" : "PHYSICAL", "Product Page": "shop", "Product URL": handles.get(b)!, Title: String(b.title || ""),
          Description: descriptionToHtml(b.description || ""), Categories: categoriesOf(b).join(", "), Tags: tagsOf(b).join(", "),
          "Hosted Image URLs": photosOf(b).map((p) => p.url).join(" "), Visible: String(b.status || "published") === "published" ? "Yes" : "No",
        });
      }
      lines.push(line);
    });
  }
  return sheet(SQUARESPACE_HEADINGS, lines);
}

// ── Big Cartel: one line per listing with numbered photo columns, so each edition is a listing of its own ──

const PHOTO_COLUMNS = 5;
export const BIGCARTEL_HEADINGS = ["TITLE", "DESCRIPTION", "STATUS", "PRICE", "QUANTITY", "SKU", "TAGS", ...Array.from({ length: PHOTO_COLUMNS }, (_, i) => `IMAGE${i + 1}`)] as const;

export function productsForBigCartel(books: any[], { now = new Date() }: { now?: Date } = {}): string {
  const lines: Record<string, string>[] = [];
  for (const b of sellable(books)) {
    const editions = editionsOf(b, now);
    for (const e of editions) {
      const line: Record<string, string> = {
        TITLE: editions.length > 1 ? `${b.title} (${e.name})` : String(b.title || ""), DESCRIPTION: descriptionToHtml(b.description || ""),
        STATUS: String(b.status || "published") === "published" ? "active" : "draft", PRICE: e.was || e.price, QUANTITY: e.stock, SKU: e.sku, TAGS: tagsOf(b).join(", "),
      };
      photosOf(b).slice(0, PHOTO_COLUMNS).forEach((p, i) => { line[`IMAGE${i + 1}`] = p.url; });
      lines.push(line);
    }
  }
  return sheet(BIGCARTEL_HEADINGS, lines);
}

// ── Photos ──

export interface PhotoPlan { url: string; handle: string; position: number; file: string }

const extOf = (url: string, type = "") => {
  const fromType = /image\/(jpeg|jpg|png|webp|gif|avif|svg\+xml)/.exec(type)?.[1];
  if (fromType) return fromType === "jpeg" ? "jpg" : fromType === "svg+xml" ? "svg" : fromType;
  const path = (() => { try { return new URL(url).pathname; } catch { return url; } })();
  const m = /\.(jpe?g|png|webp|gif|avif|svg)$/i.exec(path);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
};

/** Every photo once, named handle-position in the zip's images folder. */
export function photoPlan(books: any[]): PhotoPlan[] {
  const handles = handlesFor(sellable(books));
  const seen = new Set<string>();
  const out: PhotoPlan[] = [];
  for (const b of sellable(books)) {
    photosOf(b).forEach((p, i) => {
      if (seen.has(p.url)) return;
      seen.add(p.url);
      out.push({ url: p.url, handle: handles.get(b)!, position: i + 1, file: `images/${handles.get(b)}-${i + 1}.${extOf(p.url)}` });
    });
  }
  return out;
}

export const imagesCsv = (plan: PhotoPlan[], saved: Map<string, string>) =>
  sheet(["Product", "Position", "Original address", "File in this download"], plan.map((p) => ({ Product: p.handle, Position: String(p.position), "Original address": p.url, "File in this download": saved.get(p.url) ?? "not copied (still at the original address)" })));

// ── The whole zip ──

export interface TakeoutInput {
  pressName: string;
  books: any[];
  /** Real orders (test orders left out by the caller). */
  orders: any[];
  consent: Consent;
  notes: Map<string, { note: string; tags: string[] }>;
  pages: any[];
  settings: unknown;
  photos: { plan: PhotoPlan[]; saved: Map<string, { file: string; bytes: Uint8Array }> };
  now?: Date;
}

export interface TakeoutFile { path: string; content: string | Uint8Array }

export const TAKEOUT_PRODUCT_FILES = [
  ["products/shopify-products.csv", "books and products for Shopify"],
  ["products/woocommerce-products.csv", "books and products for WooCommerce"],
  ["products/squarespace-products.csv", "books and products for Squarespace"],
  ["products/bigcartel-products.csv", "books and products for Big Cartel"],
] as const;

export function takeoutFiles(input: TakeoutInput): TakeoutFile[] {
  const now = input.now ?? new Date();
  const { books } = input;
  const customers = customersForAnotherShop(input.orders, input.consent, input.notes);
  const photoFiles = new Map([...input.photos.saved].map(([url, v]) => [url, v.file]));
  const count = (csv: string) => Math.max(0, csv.trim().split("\n").length - 1);
  const files: TakeoutFile[] = [
    { path: "products/shopify-products.csv", content: productsForAnotherShop(books, { vendor: input.pressName, now }) },
    { path: "products/woocommerce-products.csv", content: productsForWoo(books, { now }) },
    { path: "products/squarespace-products.csv", content: productsForSquarespace(books, { now }) },
    { path: "products/bigcartel-products.csv", content: productsForBigCartel(books, { now }) },
    { path: "customers/customers.csv", content: customers },
    { path: "orders/orders.csv", content: exportOrdersCsv(input.orders, { paidOnly: false }) },
    { path: "pages/pages.json", content: `${JSON.stringify(input.pages, null, 2)}\n` },
    { path: "settings/settings.json", content: `${JSON.stringify(input.settings ?? {}, null, 2)}\n` },
    { path: "backup/books.json", content: `${JSON.stringify(books.map(({ _lastDoc, ...b }: any) => b), null, 2)}\n` },
    { path: "images/images.csv", content: imagesCsv(input.photos.plan, photoFiles) },
    ...[...input.photos.saved.values()].map((p) => ({ path: p.file, content: p.bytes })),
  ];
  const copied = input.photos.saved.size;
  const readme = [
    `${input.pressName}: your shop, to take with you`,
    "",
    `Made on ${now.toISOString().slice(0, 10)}. Everything here is yours. Keep it somewhere safe: it holds your customers' names, emails and addresses.`,
    "",
    "What is inside",
    `  products/    ${sellable(books).length} products as spreadsheets in the layout each shop system reads. Open the folder, pick the file named for the system you are moving to, and use its "import products" page.`,
    `  customers/   ${count(customers)} customers, in the layout most shop systems read. "Accepts Email Marketing" is yes only for people on your newsletter now.`,
    `  orders/      ${input.orders.length} orders as a spreadsheet, for your records or a bookkeeper. Most shop systems cannot import past orders.`,
    `  images/      ${copied} of ${input.photos.plan.length} product photos${copied < input.photos.plan.length ? "; images.csv lists the rest, which are still at their original addresses" : ""}. images.csv says which photo belongs to which product.`,
    `  pages/       your own pages (${input.pages.length}) as JSON.`,
    "  settings/    your shop's public settings as JSON.",
    "  backup/      books.json is a complete copy of every product, exactly as stored.",
    "",
    "Product files point at your photos by their web addresses. Those addresses keep working while your shop is open. After you close it, upload the photos in images/ to your new shop.",
    "Passwords and private settings are never included.",
  ].join("\r\n") + "\r\n";
  return [{ path: "README.txt", content: readme }, ...files];
}
