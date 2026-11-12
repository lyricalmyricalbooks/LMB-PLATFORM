// The document kit (code plan 11.13): one page frame, details block, line table, totals block, footer and set of print
// rules for every printed or saved document (line sheet, packing slip, invoice, receipt, report). Pure strings, no DOM,
// so the shop's printouts and the server's PDFs can draw from it. The Colophon bento look, with every word ink on a light tile.
// The press's name and address come from the caller (shopIdentity, plan 11.10); this file only lays them out.
// Restyling a document must never change a figure: callers format money and pass text in; the kit only places it.

const escape = (v: unknown): string => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Text that is already safe HTML (a picture, a line break). Everything else the kit escapes. */
export type DocRaw = { html: string };
export const docRaw = (html: string): DocRaw => ({ html });
export type DocCell = string | number | DocRaw;
const cell = (c: DocCell): string => (c && typeof c === "object" ? c.html : escape(c));

export type DocPress = { name?: string; lines?: string[] };
export type DocDetail = { label: string; value: DocCell };
export type DocColumn = { label: string; align?: "left" | "right"; narrow?: boolean };
export type DocTotal = { label: string; value: string; strong?: boolean };

/** The print rules: Letter paper, even margins, rows never split across pages, headers repeat. The Colophon bento look
 * (cream tiles with round corners, the amount due on the mint tile, the reference on an ink pill); the tile colours are
 * printed as they are (print-color-adjust), and every word stays ink on a light tile, so a black-and-white printer still
 * reads it. */
export function documentCss(): string {
  return [
    "@page{size:Letter;margin:14mm}",
    "*{box-sizing:border-box}",
    "html{-webkit-print-color-adjust:exact;print-color-adjust:exact}",
    "a{color:#1f1e1b}",
    "body{font:14px/1.45 Archivo,'Helvetica Neue',Arial,sans-serif;margin:0;color:#1f1e1b;background:#ffffff}",
    ".doc{break-after:page}.doc:last-child{break-after:auto}",
    ".doc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;background:#efede8;border-radius:20px;padding:22px 24px}",
    ".doc-press{font-size:13px;color:#55524b}.doc-press strong{display:block;font-size:17px;color:#1f1e1b;margin-bottom:2px}",
    ".doc-title{font:700 28px/1.1 Archivo,'Helvetica Neue',Arial,sans-serif;letter-spacing:-.01em;margin:0;text-align:right}",
    ".doc-ref{display:inline-block;white-space:nowrap;float:right;clear:both;font:12px/1 'DM Mono',ui-monospace,monospace;background:#1f1e1b;color:#ffffff;border-radius:999px;padding:6px 12px;margin-top:10px}",
    ".doc-details{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0}",
    ".doc-details>div{border:1px solid #e4e1da;border-radius:16px;padding:12px 14px;break-inside:avoid}",
    ".doc-details dt{font:11px 'DM Mono',ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;color:#67635b;margin-bottom:4px}",
    ".doc-details dd{margin:0;font-weight:600}",
    "table.doc-table{width:100%;border-collapse:separate;border-spacing:0;margin-top:8px}",
    ".doc-table th{font:11px 'DM Mono',ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;text-align:left;color:#55524b;background:#efede8;padding:10px 10px}",
    ".doc-table th:first-child{border-radius:12px 0 0 12px}.doc-table th:last-child{border-radius:0 12px 12px 0}",
    ".doc-table td{padding:11px 10px;border-bottom:1px solid #e4e1da;vertical-align:top}",
    ".doc-table thead{display:table-header-group}.doc-table tr{break-inside:avoid}",
    ".doc-table .num{text-align:right;white-space:nowrap}.doc-table .narrow{width:72px}",
    ".doc-table img{width:64px;height:64px;object-fit:cover;border-radius:10px}",
    ".doc-table small{font:11px 'DM Mono',ui-monospace,monospace;color:#55524b}",
    ".doc-table ul{margin:6px 0 0;padding-left:18px;font-size:13px}",
    ".doc-totals{margin:14px 0 0 auto;width:min(340px,100%);break-inside:avoid;background:#efede8;border-radius:20px;padding:10px}",
    ".doc-totals div{display:flex;justify-content:space-between;gap:16px;padding:5px 10px}",
    ".doc-totals .strong{background:#a9e8c6;border-radius:14px;font-weight:700;font-size:17px;margin-top:6px;padding:12px 12px}",
    ".doc-foot{margin-top:24px;border-top:1px solid #e4e1da;padding-top:12px;font-size:12px;color:#55524b;white-space:pre-wrap}",
  ].join("");
}

/** The press at the top left: its name, then its address one line each. */
export function documentPress(press: DocPress = {}): string {
  const name = String(press.name || "").trim();
  const lines = (press.lines || []).map(l => String(l || "").trim()).filter(Boolean);
  if (!name && !lines.length) return "";
  return `<div class="doc-press">${name ? `<strong>${escape(name)}</strong>` : ""}${lines.map(escape).join("<br>")}</div>`;
}

/** Label and value pairs (date, terms, prices in…), as a definition list. */
export function documentDetails(details: DocDetail[] = []): string {
  const shown = details.filter(d => d && String(d.label || "").trim());
  if (!shown.length) return "";
  return `<dl class="doc-details">${shown.map(d => `<div><dt>${escape(d.label)}</dt><dd>${cell(d.value)}</dd></div>`).join("")}</dl>`;
}

/** The line table. `rows` hold one cell per column. */
export function documentTable(columns: DocColumn[], rows: DocCell[][]): string {
  const head = columns.map(c => `<th scope="col" class="${c.align === "right" ? "num" : ""}${c.narrow ? " narrow" : ""}">${escape(c.label)}</th>`).join("");
  const body = rows.map(r => `<tr>${columns.map((c, i) => `<td class="${c.align === "right" ? "num" : ""}${c.narrow ? " narrow" : ""}">${cell(r[i] ?? "")}</td>`).join("")}</tr>`).join("");
  return `<table class="doc-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Subtotal, discount, shipping, tax and total, already formatted by the caller. */
export function documentTotals(totals: DocTotal[] = []): string {
  if (!totals.length) return "";
  return `<div class="doc-totals">${totals.map(t => `<div class="${t.strong ? "strong" : ""}"><span>${escape(t.label)}</span><span>${escape(t.value)}</span></div>`).join("")}</div>`;
}

/** Notes and terms at the foot. */
export function documentFooter(text = ""): string {
  return String(text || "").trim() ? `<div class="doc-foot">${escape(String(text).trim())}</div>` : "";
}

export type DocumentInput = { press?: DocPress; title: string; reference?: string; details?: DocDetail[]; body: string; footer?: string };

/** One document: press and title across the top, details, then the body (tables and totals) and the footer. */
export function documentFrame(input: DocumentInput): string {
  return `<section class="doc"><header class="doc-head">${documentPress(input.press) || "<div></div>"}<div><h1 class="doc-title">${escape(input.title)}</h1>${input.reference ? `<div class="doc-ref">${escape(input.reference)}</div>` : ""}</div></header>${documentDetails(input.details)}${input.body}${documentFooter(input.footer)}</section>`;
}

/** A whole printable page around one or more documents. */
export function documentPage(title: string, documents: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title><style>${documentCss()}</style></head><body>${documents}</body></html>`;
}
