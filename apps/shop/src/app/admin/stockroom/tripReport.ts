// Tax centre › Trips › Print report: the old stockroom's printable trip report (taxcentre.js exportTripPDF), as one
// standalone page printed from its own window ("Save as PDF" in the print dialog). Same sections and sums: details,
// spend by tax category with the deductible share, every expense, and the receipts. Picture receipts on a web address
// print as thumbnails; PDFs and receipts kept in a folder on the computer are listed by name, as the old report did
// when it couldn't draw one (rasterising PDFs needed pdf.js, which the admin doesn't carry).
import { deductibleAmount, deductibleRate } from "@stockroom/deductibility.js";

type Row = Record<string, any>;
export type TripReportInput = {
  name: string; items: Row[]; total: number; deductible?: number; categories: Record<string, number>;
  record?: Row | null; budget?: number; baseCurrency: string; pressName: string; printedOn: string;
};

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: number, cur: string) => {
  try { return new Intl.NumberFormat("en-CA", { style: "currency", currency: cur }).format(Number(n) || 0); } catch { return `${(Number(n) || 0).toFixed(2)} ${cur}`; }
};

/** Each receipt of the trip's expenses: a picture on a web address, or a file the report can only name. */
export function tripReceipts(items: Row[]) {
  const out: Array<{ desc: string; date: string; name: string; url?: string; picture: boolean }> = [];
  for (const item of items) {
    const files: unknown[] = Array.isArray(item.receiptFiles) && item.receiptFiles.length ? item.receiptFiles : item.receipt ? [item.receipt] : [];
    for (const r of files) {
      if (typeof r !== "string" || !r) continue;
      const meta = { desc: String(item.desc || ""), date: String(item.date || "") };
      if (r.startsWith("local://")) out.push({ ...meta, name: r.slice(8).split("/").pop() || r, picture: false });
      else if (/^https?:\/\//i.test(r)) {
        const name = r.split("/").pop()!.split("?")[0] || "receipt";
        out.push({ ...meta, name: decodeURIComponent(name), url: r, picture: !/\.pdf(?:$|[?#])/i.test(r) });
      }
    }
  }
  return out;
}

export function tripReportHtml(t: TripReportInput): string {
  const cur = t.baseCurrency;
  const deductible = t.deductible ?? t.total;
  const rec = t.record || {};
  const items = [...t.items].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const meta = [
    rec.destination ? ["Destination", rec.destination] : null,
    rec.startDate || rec.endDate ? ["Dates", [rec.startDate, rec.endDate].filter(Boolean).join(" – ")] : null,
    rec.purpose ? ["Business purpose", rec.purpose] : null,
    ["Expenses", `${items.length} item${items.length === 1 ? "" : "s"}`],
    ["Reporting currency", cur],
  ].filter(Boolean).map((r) => `<tr><th>${esc(r![0])}</th><td>${esc(r![1])}</td></tr>`).join("");
  const budget = Number(t.budget) || 0;
  const budgetLine = budget > 0
    ? `<p class="budget">Budget ${esc(money(budget, cur))} · ${t.total > budget ? `Over by ${esc(money(t.total - budget, cur))}` : `${esc(money(budget - t.total, cur))} remaining`}</p>` : "";
  const cats = Object.entries(t.categories || {}).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => `<tr><td>${esc(cat)}</td>
    <td class="r">${t.total > 0 ? ((amt / t.total) * 100).toFixed(1) : "0.0"}%</td><td class="r">${esc(money(amt, cur))}</td>
    <td class="r">${esc(money(deductibleAmount(cat, amt), cur))}${deductibleRate(cat) < 1 ? ` <small>(${Math.round(deductibleRate(cat) * 100)}% limit)</small>` : ""}</td></tr>`).join("")
    || `<tr><td colspan="4" class="empty">No expenses assigned to this trip.</td></tr>`;
  const rows = items.map((i) => `<tr><td>${esc(i.date || "—")}</td><td>${esc(i.desc)}</td><td>${esc(i.cat)}</td>
    <td class="r">${esc(money(Number(i.origAmount || 0), i.origCurrency || cur))}</td><td class="r">${esc(money(Number(i.baseAmount || 0), cur))}</td></tr>`).join("")
    || `<tr><td colspan="5" class="empty">No expenses assigned to this trip yet.</td></tr>`;
  const receipts = tripReceipts(items);
  const pictures = receipts.filter((r) => r.picture).map((r) => `<figure><img src="${esc(r.url)}" alt="${esc(r.desc || r.name)}"><figcaption>${esc([r.date, r.desc].filter(Boolean).join(" · "))}</figcaption></figure>`).join("");
  const named = receipts.filter((r) => !r.picture);
  const receiptPart = receipts.length ? `<h2>Receipts</h2>${pictures ? `<div class="thumbs">${pictures}</div>` : ""}${named.length
    ? `<p class="note">Kept as files, not shown here: ${named.map((r) => esc(r.name)).join(", ")}</p>` : ""}` : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Trip report — ${esc(t.name)}</title><style>
@page{size:letter portrait;margin:.55in}*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font:10.5pt/1.45 -apple-system,Helvetica,Arial,sans-serif}
.head{border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:18px}.eyebrow{font-size:8.5pt;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
h1{margin:6px 0 2px;font-size:21pt}.sub,.note,.foot,figcaption{color:#555}.sub{font-size:9.5pt}.total{font-size:20pt;font-weight:800;margin:16px 0 4px}
.budget{font-weight:700}h2{font-size:11pt;letter-spacing:.06em;text-transform:uppercase;margin:22px 0 8px}table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top}thead th{font-size:8.5pt;text-transform:uppercase;border-bottom:1.5px solid #111}
.r{text-align:right}.empty{text-align:center;font-style:italic}tfoot td{font-weight:800;border-top:1.5px solid #111;border-bottom:0}.meta th{width:34%}
.notes{margin-top:10px;padding:10px 12px;border-left:3px solid #111}.thumbs{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0;width:30%;break-inside:avoid}
img{width:100%;border:1px solid #ddd}figcaption{font-size:8pt}.foot{margin-top:26px;padding-top:10px;border-top:1px solid #ddd;font-size:8.5pt}tr{break-inside:avoid}
</style></head><body>
<div class="head"><div class="eyebrow">Business trip report</div><h1>${esc(t.name)}</h1><div class="sub">${esc(t.pressName)} · prepared ${esc(t.printedOn)}</div></div>
<div class="total">${esc(money(deductible, cur))}</div><div class="sub">Total deductible spend${deductible !== t.total ? ` (of ${esc(money(t.total, cur))} spent)` : ""}</div>${budgetLine}
<h2>Trip details</h2><table class="meta"><tbody>${meta}</tbody></table>${rec.notes ? `<div class="notes">${esc(rec.notes)}</div>` : ""}
<h2>Spend by tax category</h2><table><thead><tr><th>Tax category</th><th class="r">Share</th><th class="r">Spent (${esc(cur)})</th><th class="r">Deductible</th></tr></thead>
<tbody>${cats}</tbody><tfoot><tr><td>Total</td><td></td><td class="r">${esc(money(t.total, cur))}</td><td class="r">${esc(money(deductible, cur))}</td></tr></tfoot></table>
<h2>Expenses</h2><table><thead><tr><th>Date</th><th>Description</th><th>Tax category</th><th class="r">Original</th><th class="r">${esc(cur)}</th></tr></thead>
<tbody>${rows}</tbody><tfoot><tr><td colspan="4">Total</td><td class="r">${esc(money(t.total, cur))}</td></tr></tfoot></table>
${receiptPart}<div class="foot">Amounts converted to ${esc(cur)} at the rate stored with each expense.</div></body></html>`;
}
