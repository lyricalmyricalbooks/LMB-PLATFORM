// GENERATED from src/shared/documentKit.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// The document kit (code plan 11.13): one page frame, details block, line table, totals block, footer and set of print
// rules for every printed or saved document (line sheet, packing slip, invoice, receipt, report). Pure strings, no DOM,
// so the shop's printouts and the server's PDFs can draw from it. Black-and-white safe: ink on paper, no fill colours.
// The press's name and address come from the caller (shopIdentity, plan 11.10); this file only lays them out.
// Restyling a document must never change a figure: callers format money and pass text in; the kit only places it.
Object.defineProperty(exports, "__esModule", { value: true });
exports.docRaw = void 0;
exports.documentCss = documentCss;
exports.documentPress = documentPress;
exports.documentDetails = documentDetails;
exports.documentTable = documentTable;
exports.documentTotals = documentTotals;
exports.documentFooter = documentFooter;
exports.documentFrame = documentFrame;
exports.documentPage = documentPage;
const escape = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const docRaw = (html) => ({ html });
exports.docRaw = docRaw;
const cell = (c) => (c && typeof c === "object" ? c.html : escape(c));
/** The print rules: Letter paper, even margins, rows never split across pages, headers repeat, ink only. */
function documentCss() {
    return [
        "@page{size:Letter;margin:14mm}",
        "*{box-sizing:border-box}",
        "body{font:14px/1.45 Archivo,'Helvetica Neue',Arial,sans-serif;margin:0;color:#000;background:#fff}",
        ".doc{break-after:page}.doc:last-child{break-after:auto}",
        ".doc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:2px solid #000;padding-bottom:12px}",
        ".doc-press{font-size:13px}.doc-press strong{display:block;font-size:16px}",
        ".doc-title{font:400 30px/1 Anton,Impact,'Arial Narrow',Arial,sans-serif;letter-spacing:.02em;text-transform:uppercase;margin:0;text-align:right}",
        ".doc-ref{font:12px 'DM Mono',ui-monospace,monospace;text-align:right;margin-top:6px}",
        ".doc-details{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px 24px;margin:16px 0}",
        ".doc-details dt{font:11px 'DM Mono',ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em}",
        ".doc-details dd{margin:0 0 4px;font-weight:600}",
        "table.doc-table{width:100%;border-collapse:collapse;margin-top:8px}",
        ".doc-table th{font:11px 'DM Mono',ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;text-align:left;border-bottom:2px solid #000;padding:8px 6px}",
        ".doc-table td{padding:9px 6px;border-bottom:1px solid #000;vertical-align:top}",
        ".doc-table thead{display:table-header-group}.doc-table tr{break-inside:avoid}",
        ".doc-table .num{text-align:right;white-space:nowrap}.doc-table .narrow{width:72px}",
        ".doc-table img{width:64px;height:64px;object-fit:cover;filter:grayscale(1)}",
        ".doc-table small{font:11px 'DM Mono',ui-monospace,monospace}",
        ".doc-table ul{margin:6px 0 0;padding-left:18px;font-size:13px}",
        ".doc-totals{margin:14px 0 0 auto;width:min(320px,100%);break-inside:avoid}",
        ".doc-totals div{display:flex;justify-content:space-between;padding:4px 6px}",
        ".doc-totals .strong{border-top:2px solid #000;font-weight:700;font-size:16px;margin-top:4px;padding-top:8px}",
        ".doc-foot{margin-top:24px;border-top:1px solid #000;padding-top:10px;font-size:12px;white-space:pre-wrap}",
    ].join("");
}
/** The press at the top left: its name, then its address one line each. */
function documentPress(press = {}) {
    const name = String(press.name || "").trim();
    const lines = (press.lines || []).map(l => String(l || "").trim()).filter(Boolean);
    if (!name && !lines.length)
        return "";
    return `<div class="doc-press">${name ? `<strong>${escape(name)}</strong>` : ""}${lines.map(escape).join("<br>")}</div>`;
}
/** Label and value pairs (date, terms, prices in…), as a definition list. */
function documentDetails(details = []) {
    const shown = details.filter(d => d && String(d.label || "").trim());
    if (!shown.length)
        return "";
    return `<dl class="doc-details">${shown.map(d => `<div><dt>${escape(d.label)}</dt><dd>${cell(d.value)}</dd></div>`).join("")}</dl>`;
}
/** The line table. `rows` hold one cell per column. */
function documentTable(columns, rows) {
    const head = columns.map(c => `<th scope="col" class="${c.align === "right" ? "num" : ""}${c.narrow ? " narrow" : ""}">${escape(c.label)}</th>`).join("");
    const body = rows.map(r => `<tr>${columns.map((c, i) => `<td class="${c.align === "right" ? "num" : ""}${c.narrow ? " narrow" : ""}">${cell(r[i] ?? "")}</td>`).join("")}</tr>`).join("");
    return `<table class="doc-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
/** Subtotal, discount, shipping, tax and total, already formatted by the caller. */
function documentTotals(totals = []) {
    if (!totals.length)
        return "";
    return `<div class="doc-totals">${totals.map(t => `<div class="${t.strong ? "strong" : ""}"><span>${escape(t.label)}</span><span>${escape(t.value)}</span></div>`).join("")}</div>`;
}
/** Notes and terms at the foot. */
function documentFooter(text = "") {
    return String(text || "").trim() ? `<div class="doc-foot">${escape(String(text).trim())}</div>` : "";
}
/** One document: press and title across the top, details, then the body (tables and totals) and the footer. */
function documentFrame(input) {
    return `<section class="doc"><header class="doc-head">${documentPress(input.press) || "<div></div>"}<div><h1 class="doc-title">${escape(input.title)}</h1>${input.reference ? `<div class="doc-ref">${escape(input.reference)}</div>` : ""}</div></header>${documentDetails(input.details)}${input.body}${documentFooter(input.footer)}</section>`;
}
/** A whole printable page around one or more documents. */
function documentPage(title, documents) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title><style>${documentCss()}</style></head><body>${documents}</body></html>`;
}
