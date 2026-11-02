// The line sheet (code plan 12.10): one printed page of chosen products with the wholesale price, for a shop that
// might stock them. Pure and tested; the catalog prints it. The wholesale price is a private product field
// (bookPrivate.ts), so it only ever appears here, in the admin, and never on the public product record.
import { docRaw, documentFrame, documentPage, documentTable, type DocCell } from "../../shared/documentKit";
import { shopAddressLines } from "./orderPrint";
const escape = (v: any) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: number, currency: string) => {
  try { return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(n); } catch { return `${n.toFixed(2)} ${currency}`; }
};
const cents = (n: number) => Math.round(n * 100) / 100;
const positive = (v: any) => (Number(v) > 0 ? Number(v) : 0);

export type LineSheetShop = { name?: string; location?: any; terms?: string };
export type LineSheetRow = { id: string; title: string; maker: string; code: string; photo: string; retail: number; wholesale: number; editions: { name: string; retail: number; wholesale: number }[] };

/** The products that have a wholesale price, as rows; `skipped` names the others (they have none, or no price). */
export function lineSheetRows(books: any[]): { rows: LineSheetRow[]; skipped: string[] } {
  const rows: LineSheetRow[] = [];
  const skipped: string[] = [];
  for (const b of books || []) {
    const retail = positive(b?.retailPrice);
    const wholesale = positive(b?.wholesalePrice);
    if (!wholesale || !retail) { skipped.push(String(b?.title || "Untitled")); continue; }
    // An edition (a size, a format) has its own retail price; it gets the product's own wholesale share of it.
    const share = wholesale / retail;
    const editions = (Array.isArray(b.variants) ? b.variants : [])
      .map((v: any) => ({ name: String(v?.name || "").trim(), retail: positive(v?.price) }))
      .filter((v: { name: string; retail: number }) => v.name && v.retail)
      .map((v: { name: string; retail: number }) => ({ ...v, wholesale: cents(v.retail * share) }));
    rows.push({
      id: String(b.id || ""), title: String(b.title || "Untitled"), maker: String(b.authorName || b.subtitle || ""),
      code: String(b.isbn || b.sku || ""), photo: String(b.photos?.[0]?.url || ""), retail, wholesale, editions,
    });
  }
  return { rows, skipped };
}

/** The sheet's HTML, on the shared document kit (shared/documentKit.ts): the same page frame, table and print rules as every other document. */
export function lineSheetHtml(rows: LineSheetRow[], shop: LineSheetShop = {}, currency = "CAD", date = ""): string {
  const product = (r: LineSheetRow): DocCell => docRaw(`<strong>${escape(r.title)}</strong>${r.maker ? `<br>${escape(r.maker)}` : ""}${r.code ? `<br><small>${escape(r.code)}</small>` : ""}${r.editions.length ? `<ul>${r.editions.map(e => `<li>${escape(e.name)}: retail ${money(e.retail, currency)}, wholesale ${money(e.wholesale, currency)}</li>`).join("")}</ul>` : ""}`);
  const table = documentTable(
    [{ label: "Photo", narrow: true }, { label: "Product" }, { label: "Retail", align: "right" }, { label: "Wholesale", align: "right" }],
    rows.map(r => [r.photo ? docRaw(`<img src="${escape(r.photo)}" alt="">`) : "", product(r), money(r.retail, currency), docRaw(`<strong>${escape(money(r.wholesale, currency))}</strong>`)]),
  );
  return documentFrame({
    press: { name: shop.name, lines: shopAddressLines(shop.location) },
    title: "Line sheet",
    details: [{ label: "Prices", value: `Wholesale, in ${currency}` }, ...(date ? [{ label: "Date", value: date }] : [])],
    body: table,
    footer: shop.terms,
  });
}

/** Opens the print dialog for the sheet (the same hidden-frame way the packing slips print). */
export function printLineSheet(rows: LineSheetRow[], shop: LineSheetShop = {}, currency = "CAD") {
  const frame = document.createElement("iframe");
  frame.title = "Line sheet"; frame.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px";
  frame.onload = () => { frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), { once: true }); frame.contentWindow?.focus(); frame.contentWindow?.print(); };
  const date = new Date().toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
  frame.srcdoc = documentPage("Line sheet", lineSheetHtml(rows, shop, currency, date));
  document.body.appendChild(frame);
}
