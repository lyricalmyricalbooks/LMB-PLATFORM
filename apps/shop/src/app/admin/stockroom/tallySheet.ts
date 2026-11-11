// Stockroom › QR codes › Tally sheet: the old stockroom's printable "Sales Tracker" (fair-kit.js printSalesTracker),
// moved line for line. A paper sheet for a fair: one row per title, a box per sale, an optional price row, a total.
import { computeTallyRowHeights } from "@stockroom/print-sheet-layout.js";

export type TallyRow = { title: string; author: string; qty: number };
export type TallyOptions = { event: string; date: string; cols: number; notes: boolean; currencySymbol: string; rows: TallyRow[]; heading: string; titleHeading: string };

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The old sheet's type sizes for its row count (computeSalesTrackerLayoutSizes, unchanged). */
export function tallySizes(visualRows: number) {
  const s = { thHeight: 32, titleFontSize: "11.5pt", authorFontSize: "9pt", packedFontSize: "8.5pt", thFontSize: "11pt", metaFontSize: "12pt", metaGap: "36px", grandBoxW: "110px", grandBoxH: "44px", grandLabelFontSize: "14pt", grandMarginTop: "18px" };
  if (visualRows === 1) Object.assign(s, { thHeight: 44, titleFontSize: "18pt", authorFontSize: "12.5pt", packedFontSize: "11.5pt", thFontSize: "13pt", metaFontSize: "13.5pt", metaGap: "48px", grandBoxW: "140px", grandBoxH: "56px", grandLabelFontSize: "16pt", grandMarginTop: "28px" });
  else if (visualRows === 2) Object.assign(s, { thHeight: 40, titleFontSize: "15pt", authorFontSize: "11pt", packedFontSize: "10.5pt", thFontSize: "12pt", metaFontSize: "13pt", metaGap: "42px", grandBoxW: "130px", grandBoxH: "50px", grandLabelFontSize: "15pt", grandMarginTop: "24px" });
  else if (visualRows <= 4) Object.assign(s, { thHeight: 36, titleFontSize: "13.5pt", authorFontSize: "10pt", packedFontSize: "9.5pt", thFontSize: "11.5pt", metaFontSize: "12.5pt", metaGap: "38px", grandBoxW: "120px", grandBoxH: "46px", grandLabelFontSize: "14.5pt", grandMarginTop: "20px" });
  else if (visualRows <= 6) Object.assign(s, { titleFontSize: "12pt", authorFontSize: "9.5pt", packedFontSize: "9pt" });
  else if (visualRows <= 9) { /* the defaults */ }
  else if (visualRows <= 14) Object.assign(s, { thHeight: 28, titleFontSize: "10.5pt", authorFontSize: "8.5pt", packedFontSize: "8pt", thFontSize: "10pt", grandBoxW: "100px", grandBoxH: "38px", grandLabelFontSize: "13pt", grandMarginTop: "14px" });
  else Object.assign(s, { thHeight: 24, titleFontSize: "9.5pt", authorFontSize: "8pt", packedFontSize: "7.5pt", thFontSize: "9.5pt", grandBoxW: "90px", grandBoxH: "32px", grandLabelFontSize: "12pt", grandMarginTop: "10px" });
  return s;
}

/** The whole printable page. Columns are kept to 1–30, as in the old sheet. */
export function tallySheetHtml(o: TallyOptions): string {
  const cols = Math.min(30, Math.max(1, Math.floor(o.cols) || 10));
  const rows = o.rows;
  const packed = rows.reduce((n, r) => n + (r.qty > 0 ? r.qty : 0), 0);
  const dateLabel = o.date ? new Date(`${o.date}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
  const z = tallySizes(rows.length * (o.notes ? 2 : 1));
  const { tallyRowHeight, priceRowHeight } = computeTallyRowHeights(rows.length, { includeNotes: o.notes, thHeight: z.thHeight });
  const cells = (cls: string) => `<td class="${cls}"></td>`.repeat(cols);
  const body = rows.map(({ title, author, qty }) => {
    const name = `<div class="title-name">${esc(title)}</div>${author ? `<div class="title-meta">${esc(author)}</div>` : ""}${qty > 0 ? `<div class="title-packed">Packed: ${qty}</div>` : ""}`;
    return o.notes
      ? `<tr><td class="title" rowspan="2">${name}</td>${cells("tally")}<td class="total" rowspan="2"></td></tr><tr class="price-row">${cells("price-paid")}</tr>`
      : `<tr><td class="title">${name}</td>${cells("tally")}<td class="total"></td></tr>`;
  }).join("");
  const heads = Array.from({ length: cols }, (_, i) => `<th class="num">${i + 1}</th>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(o.heading)}${o.event ? ` — ${esc(o.event)}` : ""}</title><style>
@page{size:letter landscape;margin:.4in}*{box-sizing:border-box}html,body{background:#fff;color:#17130f;margin:0;padding:0}
body{font-family:"Archivo","Helvetica Neue",Helvetica,Arial,sans-serif;padding:.2in}
.header{text-align:center;margin-bottom:14px;border-bottom:2px solid #17130f;padding-bottom:8px}.header h1{margin:0;font-family:"Anton",Impact,sans-serif;font-size:26pt;font-weight:800;letter-spacing:.035em;text-transform:uppercase}
.meta{display:flex;gap:${z.metaGap};margin-bottom:12px;font-size:${z.metaFontSize}}.meta-row{flex:1;display:flex;align-items:baseline;gap:8px;border-bottom:1.5px solid #17130f;padding-bottom:4px;min-height:1.4em}.meta-row .label{font-weight:800}.meta-row .value{flex:1;font-weight:500}
table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1.2px solid #17130f;padding:0}
thead th{background:#e8e1d6;font-size:${z.thFontSize};font-weight:800;text-align:center;height:${z.thHeight}px;padding:4px;text-transform:uppercase;letter-spacing:.04em}
thead th.title-col{text-align:left;padding-left:10px;width:22%}thead th.total-col{background:#e6b4a8;width:80px}
td.title{padding:8px 10px;vertical-align:middle}td.title .title-name{font-family:"Anton",Impact,sans-serif;font-weight:700;font-size:${z.titleFontSize};line-height:1.2;text-transform:uppercase;letter-spacing:.02em}
td.title .title-meta{font-size:${z.authorFontSize};color:#555;margin-top:2px}td.title .title-packed{font-size:${z.packedFontSize};font-weight:700;color:#654400;margin-top:2px}
thead{display:table-header-group}tbody tr{break-inside:avoid;page-break-inside:avoid}
td.tally{height:${tallyRowHeight}px}td.total{background:#f4ded8;height:${tallyRowHeight}px}
td.price-paid{background:#fafafa;height:${priceRowHeight}px;text-align:center;vertical-align:middle}tr.price-row td.price-paid::before{content:"${esc(o.currencySymbol)} ___";color:#bbb;font-size:8pt}
.grand-row{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:${z.grandMarginTop}}.grand-label{font-size:${z.grandLabelFontSize};font-weight:800}.grand-box{width:${z.grandBoxW};height:${z.grandBoxH};border:2px solid #17130f;background:#f4ded8}
@media print{body{padding:0}}</style></head><body>
<div class="header"><h1>${esc(o.heading)}</h1></div>
<div class="meta"><div class="meta-row"><span class="label">Event:</span><span class="value">${esc(o.event) || "&nbsp;"}</span></div>
<div class="meta-row"><span class="label">Date:</span><span class="value">${esc(dateLabel) || "&nbsp;"}</span></div>
${packed > 0 ? `<div class="meta-row"><span class="label">Packed:</span><span class="value">${packed} cop${packed === 1 ? "y" : "ies"}</span></div>` : ""}</div>
<table><thead><tr><th class="title-col">${esc(o.titleHeading)}</th>${heads}<th class="total-col">TOTAL</th></tr></thead><tbody>${body}</tbody></table>
<div class="grand-row"><div class="grand-label">GRAND TOTAL</div><div class="grand-box"></div></div>
<script>window.onload=function(){window.print()}</script></body></html>`;
}
