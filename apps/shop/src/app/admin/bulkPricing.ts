// Bulk price maths for the Books catalog. Pure; the caller writes the results.
export type PriceMode = "percent" | "amount" | "set";

/** Returns the new price in dollars (2dp, never below 0), or null when the input can't be applied. */
export function adjustPrice(current: number, mode: PriceMode, value: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(current)) return null;
  const next = mode === "percent" ? current * (1 + value / 100) : mode === "amount" ? current + value : value;
  if (mode === "set" && value < 0) return null;
  return Math.max(0, Math.round(next * 100) / 100);
}

export interface PricePreview {
  id: string; title: string; from: number; to: number;
  /** The fields to write (retailPrice, or editions' prices). */
  patch: Record<string, any>;
  /** Edition price changes, when editions were included. */
  editions?: { name: string; from: number; to: number }[];
}
export interface PriceSkip { id: string; title: string; reason: string }
export interface PriceOptions { includeEditions?: boolean }

/**
 * Which books a bulk price change touches and what it writes. Never leaves a sale price at or above the new
 * regular price (that book is skipped and named, so the owner fixes the sale first); gift cards are skipped
 * (their prices are their amounts); books sold in editions change their editions' prices only when asked —
 * their own price is never what shoppers pay (CartContext.catalogUnitPrice).
 */
export function planPriceChange(books: any[], mode: PriceMode, value: number, opts: PriceOptions = {}): { changes: PricePreview[]; skipped: PriceSkip[] } {
  const changes: PricePreview[] = [];
  const skipped: PriceSkip[] = [];
  for (const b of books) {
    const title = b.title || "Untitled";
    if (b.productType === "giftCard") { skipped.push({ id: b.id, title, reason: "gift card — change its amounts in the book editor" }); continue; }
    const variants = Array.isArray(b.variants) ? b.variants : [];
    if (variants.length) {
      if (!opts.includeEditions) { skipped.push({ id: b.id, title, reason: "sold in editions — tick “Include edition prices” to change them" }); continue; }
      const editions: { name: string; from: number; to: number }[] = [];
      const next = variants.map((v: any, i: number) => {
        const from = Number(v?.price);
        if (v?.price === "" || v?.price == null || !Number.isFinite(from)) return v;
        const to = adjustPrice(from, mode, value);
        if (to === null || to === from) return v;
        editions.push({ name: v.name || `Edition ${i + 1}`, from, to });
        return { ...v, price: to };
      });
      if (!editions.length) continue;
      const lows = (list: any[]) => Math.min(...list.map((v: any) => Number(v.price)).filter(Number.isFinite));
      changes.push({ id: b.id, title, from: lows(variants), to: lows(next), patch: { variants: next }, editions });
      continue;
    }
    const from = Number(b.retailPrice);
    if (!Number.isFinite(from)) continue;
    const to = adjustPrice(from, mode, value);
    if (to === null || to === from) continue;
    const sale = Number(b.salePrice);
    if (b.isOnSale && sale > 0 && sale >= to) {
      skipped.push({ id: b.id, title, reason: `its sale price CA$${sale.toFixed(2)} would not be below the new price CA$${to.toFixed(2)} — change or end the sale first` });
      continue;
    }
    changes.push({ id: b.id, title, from, to, patch: { retailPrice: to } });
  }
  return { changes, skipped };
}

/** Plain books whose price would change (kept for callers that only need the simple list). */
export function previewPrices(books: any[], mode: PriceMode, value: number): { id: string; title: string; from: number; to: number }[] {
  return planPriceChange(books, mode, value).changes.map(({ id, title, from, to }) => ({ id, title, from, to }));
}

/**
 * The Books › Export CSV file. Its headings are the ones Import CSV reads (catalogImport.ts), so an
 * exported file can be edited in a spreadsheet and imported back; an unedited file changes nothing.
 */
export function catalogToCsv(books: any[]): string {
  const money = (v: unknown) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? "" : Number(v).toFixed(2));
  const head = ["ID", "Title", "Author", "Format", "ISBN", "SKU", "Status", "Featured", "Price", "Sale price", "Sale starts", "Sale ends", "Stock",
    "Categories", "Tags", "Publisher", "Publication date", "Pages", "Edition", "Language", "Weight", "Shipping profile", "Image URL", "Extra image URLs", "Description"];
  const photos = (b: any) => (Array.isArray(b.photos) ? b.photos.map((p: any) => p?.url).filter(Boolean) : []);
  return [head.map(cell).join(","), ...books.map((b) => [
    b.id, b.title, b.subtitle || b.authorName, b.format, b.isbn, b.sku, b.status || "published", (b.isFeatured ?? b.featured) ? "yes" : "no",
    money(b.retailPrice ?? 0), b.isOnSale && Number(b.salePrice) > 0 ? money(b.salePrice) : "", b.saleStartsAt || "", b.saleEndsAt || "", b.stockLevel ?? "",
    (b.categories || b.genres || []).join("; "), (b.tags || []).join("; "), b.publisher, b.publishDate, Number(b.pageCount) > 0 ? b.pageCount : "", b.edition, b.language,
    b.weight || "", b.shippingProfileId || "", photos(b)[0] || b.photoUrl || "", photos(b).slice(1).join(" | "), b.description,
  ].map(cell).join(","))].join("\n");
}

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;

/**
 * Books › Export › Inventory only: one line per book, or per edition for books sold in editions, for a stock
 * count. Reference file — Import reads its book lines, but edition stock is changed in the book editor.
 */
export function inventoryCsv(books: any[]): string {
  const head = ["ID", "Title", "ISBN", "SKU", "Edition (variant)", "Stock"];
  const lines: unknown[][] = [];
  for (const b of books) {
    const variants = Array.isArray(b.variants) ? b.variants : [];
    const tracked = !!b.trackInventory;
    if (!variants.length) { lines.push([b.id, b.title, b.isbn, b.sku, "", tracked ? b.stockLevel ?? 0 : "not tracked"]); continue; }
    for (const v of variants) lines.push([b.id, b.title, b.isbn, v.sku || b.sku, v.name || "", tracked ? v.stock ?? v.stockLevel ?? 0 : "not tracked"]);
  }
  return [head.map(cell).join(","), ...lines.map(l => l.map(cell).join(","))].join("\n");
}
