// Take your shop with you (plan 7.18): Settings › General › Backups & export › "Download for another shop system".
// Pure, tested. Books go out in the product spreadsheet layout most shop systems read, customers in the customer
// layout most read, so a press that leaves can bring its books and customers into whatever it moves to. The words a
// press sees never name another system (shopMove.ts has the same rule).
//
// Product layout: one line per edition, grouped by Handle; the book's details on its first line; each extra photo on a
// line of its own with only Handle, Image Src and Image Position. Source: "Using CSV files to import and export
// products", https://help.shopify.com/manual/products/import-export/using-csv (docs/research/2026-10-28-next-build-plan.md
// › Moving in, [S13]). That page now lists newer headings (URL handle, Price, Product image URL…) and says older
// templates "may use different column names" and are still accepted. This export uses the long-standing headings
// (Handle, Variant Price, Image Src…) because they are the ones this shop's own importer reads back today
// (shopMove.ts recognizeExport "handle-rows"), so a file made here also comes straight back in.
//
// Customer layout: [S14] "Importing and exporting customers", https://help.shopify.com/en/manual/customers/import-export-customers:
// First Name, Last Name, Email, Accepts Email Marketing, the Default Address columns, Phone, Total Spent, Total Orders,
// Note, Tags. Consent is "yes" or "no" per channel: "yes" only for someone on this shop's newsletter now (confirmed, not
// opted out). Everyone else gets "no", as the source says for people who never agreed or unsubscribed.
import { parseWeightGrams } from "../../shared/weightGrams";
import { saleActive } from "../../shared/promotions";
import { productOptions, usesOptionPicker, variantPicks } from "../../shared/productOptions";
import { buildCustomers } from "./customerInsights";

export const PRODUCT_HEADINGS = [
  "Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Published", "Option1 Name", "Option1 Value",
  "Option2 Name", "Option2 Value", "Option3 Name", "Option3 Value",
  "Variant SKU", "Variant Grams", "Variant Inventory Qty", "Variant Inventory Policy", "Variant Fulfillment Service",
  "Variant Price", "Variant Compare At Price", "Variant Requires Shipping", "Variant Taxable", "Variant Barcode",
  "Image Src", "Image Position", "Image Alt Text", "Gift Card", "SEO Title", "SEO Description", "Variant Image", "Status",
] as const;

export const CUSTOMER_HEADINGS = [
  "First Name", "Last Name", "Email", "Accepts Email Marketing", "Default Address Company", "Default Address Address1",
  "Default Address Address2", "Default Address City", "Default Address Province Code", "Default Address Country Code",
  "Default Address Zip", "Default Address Phone", "Phone", "Accepts SMS Marketing", "Total Spent", "Total Orders",
  "Note", "Tax Exempt", "Tags",
] as const;

type ProductLine = Partial<Record<(typeof PRODUCT_HEADINGS)[number], string>>;
type CustomerLine = Partial<Record<(typeof CUSTOMER_HEADINGS)[number], string>>;

/** Always quoted; a cell a spreadsheet would run as a formula gets a leading ' (shopMove takes it off again). */
const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;
const table = <H extends readonly string[]>(headings: H, lines: Partial<Record<H[number], string>>[]) =>
  [headings.map(cell).join(","), ...lines.map((line) => headings.map((h) => cell(line[h as H[number]])).join(","))].join("\n") + "\n";

const money = (v: unknown) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? "" : Number(v).toFixed(2));
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One line of this shop's description text with bold, italic and links as HTML. */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\(((?:https?:|mailto:|\/)[^)\s]*)\)/g, (_m, label, href) => `<a href="${href}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
}

/**
 * This shop's description text (what the book editor's toolbar writes: paragraphs, ## headings, - lists, > quotes,
 * ---, **bold**, *italic*, [links](…)) as the HTML other systems keep. shopMove.ts htmlToDescription reads it back.
 */
export function descriptionToHtml(text: string): string {
  const blocks = String(text ?? "").replace(/\r\n?/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n");
    if (/^---+$/.test(block)) return "<hr>";
    if (/^### /.test(block) && lines.length === 1) return `<h3>${inline(block.slice(4))}</h3>`;
    if (/^## /.test(block) && lines.length === 1) return `<h2>${inline(block.slice(3))}</h2>`;
    if (lines.every((l) => /^- /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`;
    if (/^> /.test(block)) return `<blockquote>${inline(lines.map((l) => l.replace(/^> ?/, "")).join(" "))}</blockquote>`;
    return `<p>${lines.map(inline).join("<br>")}</p>`;
  }).join("");
}

const slugOf = (book: any) => String(book?.slug || book?.title || book?.id || "book").toLowerCase().normalize("NFKD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "book";

const photosOf = (book: any): { url: string; alt: string }[] => {
  const list = Array.isArray(book?.photos) ? book.photos.filter((p: any) => p?.url).map((p: any) => ({ url: String(p.url), alt: String(p.altText || "") })) : [];
  if (!list.length && book?.photoUrl) list.push({ url: String(book.photoUrl), alt: "" });
  return list;
};

const isDigital = (book: any) => book?.digital === true || /e-?book|audiobook/i.test(String(book?.format || ""));
const grams = (weight: unknown) => { const g = parseWeightGrams(weight); return g && g > 0 ? String(Math.round(g)) : ""; };
const STATUS: Record<string, string> = { published: "active", draft: "draft", archived: "archived" };

/** Every book as product lines: one per edition, extra photos on lines of their own. Gift cards stay out. */
export function productsForAnotherShop(books: any[], { vendor = "", now = new Date() }: { vendor?: string; now?: Date } = {}): string {
  const lines: ProductLine[] = [];
  const used = new Set<string>();
  for (const b of books) {
    if (!b || b.productType === "giftCard") continue;
    let handle = slugOf(b);
    for (let n = 2; used.has(handle); n++) handle = `${slugOf(b)}-${n}`;
    used.add(handle);
    const photos = photosOf(b);
    const tracked = b.trackInventory !== false;
    const status = STATUS[String(b.status || "published")] || "draft";
    const variants = (Array.isArray(b.variants) ? b.variants : []).filter((v: any) => v && v.price !== undefined && v.price !== null && v.price !== "");
    const onSale = saleActive(b, now) && Number(b.salePrice) > 0 && Number(b.salePrice) < Number(b.retailPrice);
    const editions = variants.length
      ? variants.map((v: any) => ({
        name: String(v.name || "Edition"), price: money(v.price), was: "", sku: String(v.sku || b.sku || ""),
        stock: tracked ? String(Math.max(0, Number(v.stock ?? v.stockLevel ?? 0) || 0)) : "", grams: grams(v.weight || b.weight),
        barcode: String(v.isbn || v.barcode || ""), image: String(v.photoUrl || ""),
      }))
      : [{
        name: "", price: money(onSale ? b.salePrice : b.retailPrice ?? 0), was: onSale ? money(b.retailPrice) : "", sku: String(b.sku || ""),
        stock: tracked ? String(Math.max(0, Number(b.stockLevel ?? 0) || 0)) : "", grams: grams(b.weight),
        barcode: String(b.isbn || b.barcode || ""), image: "",
      }];
    // A product sold in sizes and colours writes its own options (plan 10.6); anything else, "Edition" or "Title".
    const options = usesOptionPicker(b) ? productOptions(b) : [];
    editions.forEach((e: (typeof editions)[number], i: number) => {
      const picks = options.length ? variantPicks(variants[i], options) : null;
      const line: ProductLine = {
        Handle: handle,
        "Option1 Name": variants.length ? "Edition" : "Title", "Option1 Value": variants.length ? e.name : "Default Title",
        ...(picks ? Object.fromEntries(options.flatMap((o, n) => [[`Option${n + 1} Name`, i === 0 ? o.name : ""], [`Option${n + 1} Value`, picks[o.name]]])) : {}),
        "Variant SKU": e.sku, "Variant Grams": e.grams, "Variant Inventory Qty": e.stock,
        "Variant Inventory Policy": b.allowBackorder === true || b.preorder === true ? "continue" : "deny",
        "Variant Fulfillment Service": "manual", "Variant Price": e.price, "Variant Compare At Price": e.was,
        "Variant Requires Shipping": isDigital(b) ? "false" : "true", "Variant Taxable": b.chargeTax === false ? "false" : "true",
        "Variant Barcode": e.barcode, "Variant Image": e.image,
      };
      if (i === 0) {
        Object.assign(line, {
          Title: String(b.title || ""), "Body (HTML)": descriptionToHtml(b.description || ""), Vendor: String(b.publisher || vendor || ""),
          Type: String((b.categories || b.genres || [])[0] || ""), Tags: (Array.isArray(b.tags) ? b.tags : []).join(", "),
          Published: status === "active" ? "true" : "false", "Gift Card": "false",
          "SEO Title": String(b.metaTitle || ""), "SEO Description": String(b.metaDescription || ""), Status: status,
          ...(photos[0] ? { "Image Src": photos[0].url, "Image Position": "1", "Image Alt Text": photos[0].alt } : {}),
        });
      }
      lines.push(line);
    });
    photos.slice(1).forEach((p, i) => lines.push({ Handle: handle, "Image Src": p.url, "Image Position": String(i + 2), "Image Alt Text": p.alt }));
  }
  return table(PRODUCT_HEADINGS, lines);
}

export interface Consent {
  /** Lower-case addresses on the newsletter now (confirmed sign-ups; adminApi.getMarketingConsent). */
  subscribed: Set<string>;
  /** True for an address that opted out of marketing email here (marketing-optout). */
  optedOut: (email: string) => boolean;
}

/**
 * Every customer (paid orders, test orders left out) and every newsletter subscriber who hasn't bought yet, as
 * customer lines. "yes" for email marketing only for someone on the newsletter now who hasn't opted out.
 */
export function customersForAnotherShop(orders: any[], consent: Consent, notes: Map<string, { note: string; tags: string[] }> = new Map()): string {
  const yes = (email: string) => consent.subscribed.has(email.toLowerCase()) && !consent.optedOut(email.toLowerCase());
  const lines: CustomerLine[] = [];
  const seen = new Set<string>();
  for (const c of buildCustomers(orders)) {
    seen.add(c.key);
    const latest = [...c.orders].sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0))
      .find((o) => o.paymentStatus === "paid") || c.orders[0];
    const address = latest?.customer?.address || latest?.shippingAddress || {};
    const [first, ...rest] = String(c.name || "").trim().split(/\s+/);
    const note = notes.get(c.key);
    lines.push({
      "First Name": first || "", "Last Name": rest.join(" "), Email: c.key, "Accepts Email Marketing": yes(c.key) ? "yes" : "no",
      "Default Address Address1": String(address.street || address.line1 || ""), "Default Address Address2": String(address.unit || address.line2 || ""),
      "Default Address City": String(address.city || c.city || ""), "Default Address Province Code": String(address.state || ""),
      "Default Address Country Code": String(address.country || c.country || ""), "Default Address Zip": String(address.zip || address.postalCode || ""),
      Phone: String(latest?.customer?.phone || ""), "Accepts SMS Marketing": "no",
      "Total Spent": c.totalSpent.toFixed(2), "Total Orders": String(c.orderCount), Note: note?.note || "", "Tax Exempt": "no",
      Tags: (note?.tags || []).join(", "),
    });
  }
  for (const email of [...consent.subscribed].sort()) {
    if (seen.has(email) || !yes(email)) continue;
    const note = notes.get(email);
    lines.push({ Email: email, "Accepts Email Marketing": "yes", "Accepts SMS Marketing": "no", "Total Spent": "0.00", "Total Orders": "0", Note: note?.note || "", "Tax Exempt": "no", Tags: (note?.tags || []).join(", ") });
  }
  return table(CUSTOMER_HEADINGS, lines);
}
