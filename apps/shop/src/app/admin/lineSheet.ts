// The line sheet (code plan 12.10): one printed page of chosen products with the wholesale price, for a shop that
// might stock them. Pure and tested; the catalog prints it. The wholesale price is a private product field
// (bookPrivate.ts), so it only ever appears here, in the admin, and never on the public product record.
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

/** The sheet's HTML. */
export function lineSheetHtml(rows: LineSheetRow[], shop: LineSheetShop = {}, currency = "CAD"): string {
  const from = [shop.name].filter(Boolean).map(escape).join("");
  const line = (r: LineSheetRow) => `<tr><td class="pic">${r.photo ? `<img src="${escape(r.photo)}" alt="">` : ""}</td><td><strong>${escape(r.title)}</strong>${r.maker ? `<br>${escape(r.maker)}` : ""}${r.code ? `<br><small>${escape(r.code)}</small>` : ""}${r.editions.length ? `<ul>${r.editions.map(e => `<li>${escape(e.name)}: retail ${money(e.retail, currency)}, wholesale ${money(e.wholesale, currency)}</li>`).join("")}</ul>` : ""}</td><td class="num">${money(r.retail, currency)}</td><td class="num"><strong>${money(r.wholesale, currency)}</strong></td></tr>`;
  return `<section>${from ? `<div class="from"><strong>${from}</strong></div>` : ""}<h1>Line sheet</h1><p>Wholesale prices in ${escape(currency)}.</p><table><thead><tr><th></th><th>Product</th><th class="num">Retail</th><th class="num">Wholesale</th></tr></thead><tbody>${rows.map(line).join("")}</tbody></table>${shop.terms ? `<p class="terms">${escape(shop.terms)}</p>` : ""}</section>`;
}

const STYLE = "body{font:15px Arial;margin:30px;color:#000}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:left;border-bottom:1px solid #aaa;vertical-align:top}.num{text-align:right;white-space:nowrap}.pic img{width:64px;height:64px;object-fit:cover}.pic{width:72px}.from{float:right;text-align:right}ul{margin:6px 0 0;padding-left:18px;font-size:13px}tr{break-inside:avoid}.terms{margin-top:24px;font-style:italic}";

/** Opens the print dialog for the sheet (the same hidden-frame way the packing slips print). */
export function printLineSheet(rows: LineSheetRow[], shop: LineSheetShop = {}, currency = "CAD") {
  const frame = document.createElement("iframe");
  frame.title = "Line sheet"; frame.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px";
  frame.onload = () => { frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), { once: true }); frame.contentWindow?.focus(); frame.contentWindow?.print(); };
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>Line sheet</title><style>${STYLE}</style></head><body>${lineSheetHtml(rows, shop, currency)}</body></html>`;
  document.body.appendChild(frame);
}
