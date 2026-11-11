// Stockroom › Invoices › Letterhead: the old stockroom's letterhead (Settings › Letterhead), by its own rules
// (letterhead.js). A letter on the press's paper, kept in this browser under the old app's key, printed on letter size.
import { normalizeLetterhead, renderLetterhead, type Letterhead } from "@stockroom/letterhead.js";

export const LETTERHEAD_KEY = "lm-letterhead";
export type { Letterhead };

/** The saved letter, its blanks filled from the invoice details (name, address, email, website), as the old app did. */
export function readLetterhead(invoice: Record<string, unknown> | null | undefined, storage: Pick<Storage, "getItem"> | null): Letterhead {
  try { return normalizeLetterhead(JSON.parse(storage?.getItem(LETTERHEAD_KEY) || "{}"), invoice || {}); }
  catch { return normalizeLetterhead({}, invoice || {}); }
}

/** The old app's print page, unchanged: letter size, no margins, its own type. */
export function letterheadPrintHtml(letter: Letterhead): string {
  return `<!doctype html><html><head><title>Letterhead</title><style>
@page{size:letter;margin:0}*{box-sizing:border-box}body{margin:0;color:#26211e;font:11pt/1.65 Georgia,serif}
.letterhead-page{width:8.5in;min-height:11in;padding:.7in .75in .6in;display:flex;flex-direction:column;background:#fff}
.letterhead-paper-header{display:flex;justify-content:space-between;align-items:center;gap:28px;border-bottom:1px solid var(--letter-accent);padding-bottom:22px;margin-bottom:46px}
.letterhead-brand{display:flex;align-items:center;gap:18px;min-width:0}.letterhead-logo{max-width:76px;max-height:70px;object-fit:contain}
.letterhead-name{font-size:21pt;line-height:1.12;letter-spacing:-.025em;font-weight:700;overflow-wrap:anywhere}.letterhead-contact{max-width:240px;text-align:right;font:8pt/1.55 Arial,sans-serif;color:#5b5651;overflow-wrap:anywhere}
.letterhead-meta{display:flex;justify-content:space-between;gap:20px;line-height:1.5;margin-bottom:32px}.letterhead-meta>div:last-child{white-space:nowrap}
.letterhead-subject{font:700 12pt/1.35 Arial,sans-serif;margin:0 0 25px}.letterhead-body{line-height:1.7;overflow-wrap:anywhere}
.letterhead-body p{margin:0 0 1em}.letterhead-body ul,.letterhead-body ol{padding-left:1.5em;margin:.5em 0 1em}
.letterhead-signoff{line-height:1.6;margin-top:28px}.letterhead-signoff:empty{display:none}.letterhead-paper-footer{margin-top:auto;border-top:1px solid #d8d3cd;padding-top:10px;text-align:center;color:#6a655f;font:8pt Arial,sans-serif}
</style></head><body>${renderLetterhead(letter)}</body></html>`;
}
