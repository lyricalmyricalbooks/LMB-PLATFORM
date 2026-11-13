// Every "bring a file" window reads spreadsheets the same way (plan 23.35): a CSV or tab-separated file, an Excel
// workbook (.xlsx) or an OpenDocument sheet (.ods, from LibreOffice or Google Sheets) all become the same CSV text the
// windows' readers already understand, so column names keep filling in the fields as before. Read in the browser with
// no extra library: an .xlsx or .ods is a zip of XML files, opened with the browser's own decompression. Only the
// first visible sheet with anything in it is read unless the owner picks another (23.37). Older Excel files (.xls) are
// read by xlsFile.ts (23.40); Numbers files get a plain way out.

import { MAX_CELLS, SpreadsheetError, TOO_LARGE, excelDate, excelEpoch, isBuiltInPercent, isDateCode, isBuiltInDate, isPercentCode, numberText, percentText, type Book } from "./spreadsheetCells";
import { xlsBook } from "./xlsFile";

export { SpreadsheetError };

/** What to tell the owner when a file can't be read: the reader's own advice, or the windows' usual words. */
export const readProblem = (err: unknown, fallback = "This file couldn't be read. Save it as CSV or Excel (.xlsx) and try again.") =>
  (err instanceof SpreadsheetError ? err.message : fallback);

/** The file types the windows' file pickers offer. */
export const SPREADSHEET_ACCEPT = ".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet,application/vnd.ms-excel";

const MAX_UNZIPPED = 200 * 1024 * 1024;

/** The file's rows as CSV text (comma separated, quoted where needed). Throws a SpreadsheetError the owner can act on. */
export async function spreadsheetText(file: Blob & { name?: string }, sheet?: string): Promise<string> {
  return (await readSpreadsheet(file, sheet)).text;
}

export type SpreadsheetRead = { text: string; sheet: string; sheets: string[] };

// A file that stands in for something read elsewhere (a Google Sheet, plan 23.42): reading it, or another of its
// sheets, asks its source again, so every window takes it like a chosen file.
const sources = new WeakMap<Blob, (sheet?: string) => Promise<SpreadsheetRead>>();
/** Makes `file` read through `read` instead of its own bytes. */
export function readThrough<T extends Blob>(file: T, read: (sheet?: string) => Promise<SpreadsheetRead>): T {
  sources.set(file, read);
  return file;
}

/**
 * One sheet of the file as CSV text, with the workbook's visible sheets so a window can offer the others (plan 23.37).
 * With no sheet named, the first visible sheet that has anything in it is read. A text file has no sheets.
 */
export async function readSpreadsheet(file: Blob & { name?: string }, sheet?: string): Promise<SpreadsheetRead> {
  const source = sources.get(file);
  if (source) return source(sheet);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = String(file.name || "").toLowerCase();
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return readBook(xlsBook(bytes), sheet);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const zip = await openZip(bytes);
    const book = zip.has("xl/workbook.xml") ? await xlsxBook(zip) : zip.has("content.xml") ? await odsBook(zip) : null;
    if (book) return readBook(book, sheet);
    if (name.endsWith(".numbers") || zip.has("Index/Document.iwa")) {
      throw new SpreadsheetError("This is a Numbers file. In Numbers choose File › Export To › Excel or CSV, and choose that file instead.");
    }
    throw new SpreadsheetError("This file is compressed but isn't a spreadsheet. Choose a CSV or Excel file.");
  }
  if (name.endsWith(".numbers")) throw new SpreadsheetError("This is a Numbers file. In Numbers choose File › Export To › Excel or CSV, and choose that file instead.");
  return { text: decodeText(bytes), sheet: "", sheets: [] };
}

/** The sheet asked for, or the first visible sheet with something in it (a cover or empty first sheet is passed over). */
async function readBook(book: Book, sheet?: string): Promise<SpreadsheetRead> {
  const sheets = book.sheets.filter((s) => !s.hidden);
  const chosen = sheet === undefined ? null : book.sheets.find((s) => s.name === sheet);
  if (sheet !== undefined && !chosen) throw new SpreadsheetError(`This workbook has no sheet called “${sheet}”. Choose the file again.`);
  let pick = chosen || sheets[0] || book.sheets[0];
  let rows = pick ? await pick.rows() : [];
  for (const s of chosen ? [] : sheets.slice(1)) { if (rows.length) break; const next = await s.rows(); if (next.length) { pick = s; rows = next; } }
  return { text: toCsv(rows), sheet: pick?.name ?? "", sheets: sheets.map((s) => s.name) };
}

// ---- Plain text: the encodings spreadsheet programs save in. ----

/** UTF-8 (with or without a byte-order mark), UTF-16 ("Unicode text" from Excel), or the older Windows encoding. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  // Two-byte text saved without its marker: plain letters leave every other byte empty.
  const sample = bytes.subarray(0, Math.min(bytes.length, 2000) & ~1);
  if (sample.length >= 8) {
    let even = 0, odd = 0;
    for (let i = 0; i < sample.length; i += 2) { if (sample[i] === 0) even++; if (sample[i + 1] === 0) odd++; }
    const half = sample.length / 2;
    if (odd > half * 0.6 && even < half * 0.1) return new TextDecoder("utf-16le").decode(bytes);
    if (even > half * 0.6 && odd < half * 0.1) return new TextDecoder("utf-16be").decode(bytes);
  }
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(body); }
  catch { return new TextDecoder("windows-1252").decode(body); }
}

/** Rows back to CSV, each cell quoted when it holds a comma, quote or line break. */
export function toCsv(rows: string[][]): string {
  // A semicolon or tab is quoted too: the reader guesses the separator from the first line, and must still pick commas.
  const cell = (v: string) => (/[",;\t\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}

// ---- Zip: just enough to read the XML parts of a workbook. ----

type Zip = { has: (path: string) => boolean; text: (path: string) => Promise<string | null> };

async function openZip(bytes: Uint8Array): Promise<Zip> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new SpreadsheetError("This file looks damaged: it couldn't be opened. Save it again and try once more.");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries = new Map<string, { method: number; size: number; local: number; unzipped: number }>();
  const utf8 = new TextDecoder();
  for (let n = 0; n < count && at + 46 <= bytes.length; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const unzipped = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    entries.set(utf8.decode(bytes.subarray(at + 46, at + 46 + nameLength)).replace(/^\//, ""), { method, size, local, unzipped });
    at += 46 + nameLength + extra + comment;
  }
  let total = 0;
  // Each part is unzipped once: the shared words and styles are read again for every sheet tried (an empty cover
  // sheet, say), and counting them again would call a fine workbook too large.
  const read = new Map<string, Promise<string | null>>();
  const text = async (path: string): Promise<string | null> => {
    const entry = entries.get(path);
    if (!entry) return null;
    total += entry.unzipped;
    if (total > MAX_UNZIPPED) throw new SpreadsheetError(TOO_LARGE);
    if (view.getUint32(entry.local, true) !== 0x04034b50) throw new SpreadsheetError("This file looks damaged: it couldn't be opened. Save it again and try once more.");
    const start = entry.local + 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true);
    const raw = bytes.subarray(start, start + entry.size);
    if (entry.method === 0) return utf8.decode(raw);
    if (entry.method !== 8) throw new SpreadsheetError("This file uses a kind of compression that can't be read here. Save it again as .xlsx or CSV.");
    return inflate(raw);
  };
  return {
    has: (path) => entries.has(path),
    text(path) {
      if (!read.has(path)) read.set(path, text(path));
      return read.get(path)!;
    },
  };
}

/** Unzips one part with the browser's own decompression. */
async function inflate(raw: Uint8Array): Promise<string> {
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  void writer.write(raw as Uint8Array<ArrayBuffer>).then(() => writer.close()).catch(() => {});
  const reader = stream.readable.getReader();
  const decoder = new TextDecoder();
  let out = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
  } catch {
    throw new SpreadsheetError("This file looks damaged: it couldn't be opened. Save it again and try once more.");
  }
  return out + decoder.decode();
}

const parseXml = (text: string) => new DOMParser().parseFromString(text, "application/xml");
/** Child elements by local name, whatever prefix the file uses. */
const kids = (el: Element, name: string) => [...el.children].filter((c) => c.localName === name);
const attr = (el: Element, name: string) => [...el.attributes].find((a) => a.localName === name)?.value ?? null;
const all = (root: Document | Element, name: string) => [...root.getElementsByTagNameNS("*", name)];

/** A whole or decimal number as a spreadsheet shows it: 64.24, not 64.239999999999995. */

// ---- Excel (.xlsx): the first sheet's cells, dates as YYYY-MM-DD (with the time when there is one). ----


async function xlsxBook(zip: Zip): Promise<Book> {
  const workbook = parseXml((await zip.text("xl/workbook.xml"))!);
  const rels = parseXml((await zip.text("xl/_rels/workbook.xml.rels")) || "<Relationships/>");
  return {
    sheets: all(workbook, "sheet").map((el, i) => {
      const rid = el.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")
        || [...el.attributes].find((a) => a.localName === "id")?.value || "";
      const target = all(rels, "Relationship").find((r) => r.getAttribute("Id") === rid)?.getAttribute("Target") || `worksheets/sheet${i + 1}.xml`;
      const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`.replace(/\/\.\//g, "/");
      const state = el.getAttribute("state");
      return { name: el.getAttribute("name") || `Sheet ${i + 1}`, hidden: state === "hidden" || state === "veryHidden", rows: () => xlsxRows(zip, workbook, path) };
    }),
  };
}

async function xlsxRows(zip: Zip, workbook: Document, path: string): Promise<string[][]> {
  const sheetXml = await zip.text(path);
  if (!sheetXml) throw new SpreadsheetError("This workbook's sheet couldn't be found. Save it again and try once more.");

  const shared = all(parseXml((await zip.text("xl/sharedStrings.xml")) || "<sst/>"), "si").map(
    (si) => all(si, "t").filter((t) => t.parentElement?.localName !== "rPh").map((t) => t.textContent || "").join(""),
  );
  const date1904 = all(workbook, "workbookPr")[0]?.getAttribute("date1904");
  const epoch = excelEpoch(date1904 === "1" || date1904 === "true");
  const { dates: dateStyles, percents: percentStyles } = await xlsxNumberStyles(zip);

  const rows: string[][] = [];
  let cells = 0;
  for (const row of all(parseXml(sheetXml), "row")) {
    const at = Number(row.getAttribute("r")) - 1;
    const index = Number.isInteger(at) && at >= 0 ? at : rows.length;
    if (index > rows.length + 100_000) break;
    const out: string[] = [];
    let next = 0;
    for (const c of kids(row, "c")) {
      if (++cells > MAX_CELLS) throw new SpreadsheetError(TOO_LARGE);
      const ref = c.getAttribute("r");
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      if (col > 16384) continue;
      const type = c.getAttribute("t") || "n";
      const v = kids(c, "v")[0]?.textContent ?? "";
      let value = "";
      // A shared-string cell with no value is empty (Number("") would be the workbook's first string).
      if (type === "s") value = v === "" ? "" : shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = all(c, "t").map((t) => t.textContent || "").join("");
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (type === "str" || type === "e") value = v;
      else if (type === "d") value = v.replace(/T00:00:00(\.0+)?Z?$/, "");
      else if (v !== "" && dateStyles.has(Number(c.getAttribute("s") || 0))) value = excelDate(Number(v), epoch);
      // A percent cell holds the fraction (15% is 0.15): read it as the sheet shows it.
      else if (v !== "" && percentStyles.has(Number(c.getAttribute("s") || 0))) value = percentText(v);
      else value = v === "" ? "" : numberText(v);
      while (out.length < col) out.push("");
      out[col] = value;
    }
    while (rows.length < index) rows.push([]);
    rows[index] = out;
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Column letters to a number: A → 0, Z → 25, AA → 26. */
const columnIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/[^A-Z]/gi, "").toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/**
 * The cell styles that show a date (built-in date formats, or a custom one made of d, m, y and time parts), and the
 * ones that show a percent.
 */
async function xlsxNumberStyles(zip: Zip): Promise<{ dates: Set<number>; percents: Set<number> }> {
  const styles = parseXml((await zip.text("xl/styles.xml")) || "<styleSheet/>");
  const custom = new Map(all(styles, "numFmt").map((f) => [Number(f.getAttribute("numFmtId")), f.getAttribute("formatCode") || ""]));
  const isDate = (id: number) => isBuiltInDate(id) || isDateCode(custom.get(id) || "");
  const isPercent = (id: number) => isBuiltInPercent(id) || isPercentCode(custom.get(id) || "");
  const xfs = all(styles, "cellXfs")[0];
  const dates = new Set<number>();
  const percents = new Set<number>();
  if (xfs) kids(xfs, "xf").forEach((xf, i) => {
    const id = Number(xf.getAttribute("numFmtId") || 0);
    if (isDate(id)) dates.add(i);
    else if (isPercent(id)) percents.add(i);
  });
  return { dates, percents };
}

// ---- OpenDocument (.ods): the first table's cells. ----

async function odsBook(zip: Zip): Promise<Book> {
  const doc = parseXml((await zip.text("content.xml"))!);
  // A hidden sheet's table style says display="false".
  const hiddenStyles = new Set(all(doc, "style").filter((st) => all(st, "table-properties").some((p) => attr(p, "display") === "false")).map((st) => attr(st, "name")));
  return {
    sheets: all(doc, "table").filter((t) => t.parentElement?.localName === "spreadsheet").map((t, i) => ({
      name: attr(t, "name") || `Sheet ${i + 1}`, hidden: hiddenStyles.has(attr(t, "style-name")), rows: async () => odsRows(t),
    })),
  };
}

function odsRows(table: Element): string[][] {
  const rows: string[][] = [];
  let cells = 0;
  for (const row of all(table, "table-row")) {
    const out: string[] = [];
    for (const c of [...row.children].filter((e) => e.localName === "table-cell" || e.localName === "covered-table-cell")) {
      const type = attr(c, "value-type");
      let value = "";
      if (type === "date") value = (attr(c, "date-value") || "").replace(/T00:00:00(\.0+)?$/, "").replace("T", " ");
      else if (type === "percentage") value = percentText(attr(c, "value") || "");
      else if (type === "float" || type === "currency") value = numberText(attr(c, "value") || "");
      else if (type === "boolean") value = attr(c, "boolean-value") === "true" ? "TRUE" : "FALSE";
      else value = kids(c, "p").map(odsText).join("\n");
      // A run of empty cells is written once with a repeat count (often thousands, to the sheet's edge).
      const repeat = Math.min(Number(attr(c, "number-columns-repeated")) || 1, value === "" ? 1024 : 16384);
      for (let i = 0; i < repeat; i++) out.push(value);
      cells += repeat;
      if (cells > MAX_CELLS) throw new SpreadsheetError(TOO_LARGE);
    }
    while (out.length && out[out.length - 1] === "") out.pop();
    const repeat = Math.min(Number(attr(row, "number-rows-repeated")) || 1, out.length ? 100_000 : 1);
    for (let i = 0; i < repeat; i++) rows.push(out);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** A paragraph's words, with ODF's spaces, tabs and line breaks. */
function odsText(node: Node): string {
  let out = "";
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) out += child.textContent || "";
    else if (child.nodeType === 1) {
      const el = child as Element;
      if (el.localName === "s") out += " ".repeat(Number([...el.attributes].find((a) => a.localName === "c")?.value) || 1);
      else if (el.localName === "tab") out += "\t";
      else if (el.localName === "line-break") out += "\n";
      else out += odsText(el);
    }
  }
  return out;
}
