// Every "bring a file" window reads spreadsheets the same way (plan 23.35): a CSV or tab-separated file, an Excel
// workbook (.xlsx) or an OpenDocument sheet (.ods, from LibreOffice or Google Sheets) all become the same CSV text the
// windows' readers already understand, so column names keep filling in the fields as before. Read in the browser with
// no extra library: an .xlsx or .ods is a zip of XML files, opened with the browser's own decompression. Only the
// first sheet is read (the one a shop's export puts its rows on). Older formats get a plain way out.

export class SpreadsheetError extends Error {}

/** What to tell the owner when a file can't be read: the reader's own advice, or the windows' usual words. */
export const readProblem = (err: unknown, fallback = "This file couldn't be read. Save it as CSV or Excel (.xlsx) and try again.") =>
  (err instanceof SpreadsheetError ? err.message : fallback);

/** The file types the windows' file pickers offer. */
export const SPREADSHEET_ACCEPT = ".csv,.tsv,.txt,.xlsx,.xlsm,.ods,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet";

const MAX_CELLS = 2_000_000;
const MAX_UNZIPPED = 200 * 1024 * 1024;

/** The file's rows as CSV text (comma separated, quoted where needed). Throws a SpreadsheetError the owner can act on. */
export async function spreadsheetText(file: Blob & { name?: string }): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = String(file.name || "").toLowerCase();
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new SpreadsheetError("This is an older Excel file (.xls). In Excel choose File › Save As › Excel Workbook (.xlsx), or CSV, and choose that file instead.");
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const zip = await openZip(bytes);
    if (zip.has("xl/workbook.xml")) return toCsv(await xlsxRows(zip));
    if (zip.has("content.xml")) return toCsv(await odsRows(zip));
    if (name.endsWith(".numbers") || zip.has("Index/Document.iwa")) {
      throw new SpreadsheetError("This is a Numbers file. In Numbers choose File › Export To › Excel or CSV, and choose that file instead.");
    }
    throw new SpreadsheetError("This file is compressed but isn't a spreadsheet. Choose a CSV or Excel file.");
  }
  if (name.endsWith(".numbers")) throw new SpreadsheetError("This is a Numbers file. In Numbers choose File › Export To › Excel or CSV, and choose that file instead.");
  return decodeText(bytes);
}

// ---- Plain text: the encodings spreadsheet programs save in. ----

/** UTF-8 (with or without a byte-order mark), UTF-16 ("Unicode text" from Excel), or the older Windows encoding. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(body); }
  catch { return new TextDecoder("windows-1252").decode(body); }
}

/** Rows back to CSV, each cell quoted when it holds a comma, quote or line break. */
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
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
  return {
    has: (path) => entries.has(path),
    async text(path) {
      const entry = entries.get(path);
      if (!entry) return null;
      total += entry.unzipped;
      if (total > MAX_UNZIPPED) throw new SpreadsheetError("This file is too large to read here. Save a shorter part of it and bring the parts one at a time.");
      if (view.getUint32(entry.local, true) !== 0x04034b50) throw new SpreadsheetError("This file looks damaged: it couldn't be opened. Save it again and try once more.");
      const start = entry.local + 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true);
      const raw = bytes.subarray(start, start + entry.size);
      if (entry.method === 0) return utf8.decode(raw);
      if (entry.method !== 8) throw new SpreadsheetError("This file uses a kind of compression that can't be read here. Save it again as .xlsx or CSV.");
      return inflate(raw);
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
const all = (root: Document | Element, name: string) => [...root.getElementsByTagNameNS("*", name)];

/** A whole or decimal number as a spreadsheet shows it: 64.24, not 64.239999999999995. */
const numberText = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? String(Number(n.toPrecision(15))) : v;
};

// ---- Excel (.xlsx): the first sheet's cells, dates as YYYY-MM-DD (with the time when there is one). ----

const BUILT_IN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

async function xlsxRows(zip: Zip): Promise<string[][]> {
  const workbook = parseXml((await zip.text("xl/workbook.xml"))!);
  const sheets = all(workbook, "sheet");
  const first = sheets.find((s) => s.getAttribute("state") !== "hidden" && s.getAttribute("state") !== "veryHidden") || sheets[0];
  if (!first) return [];
  const rid = first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")
    || [...first.attributes].find((a) => a.localName === "id")?.value || "";
  const rels = parseXml((await zip.text("xl/_rels/workbook.xml.rels")) || "<Relationships/>");
  const target = all(rels, "Relationship").find((r) => r.getAttribute("Id") === rid)?.getAttribute("Target") || "worksheets/sheet1.xml";
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`.replace(/\/\.\//g, "/");
  const sheetXml = await zip.text(path);
  if (!sheetXml) throw new SpreadsheetError("This workbook's first sheet couldn't be found. Save it again and try once more.");

  const shared = all(parseXml((await zip.text("xl/sharedStrings.xml")) || "<sst/>"), "si").map(
    (si) => all(si, "t").filter((t) => t.parentElement?.localName !== "rPh").map((t) => t.textContent || "").join(""),
  );
  const date1904 = all(workbook, "workbookPr")[0]?.getAttribute("date1904");
  const epoch = Date.UTC(date1904 === "1" || date1904 === "true" ? 1904 : 1899, date1904 === "1" || date1904 === "true" ? 0 : 11, date1904 === "1" || date1904 === "true" ? 1 : 30);
  const dateStyles = await xlsxDateStyles(zip);

  const rows: string[][] = [];
  let cells = 0;
  for (const row of all(parseXml(sheetXml), "row")) {
    const at = Number(row.getAttribute("r")) - 1;
    const index = Number.isInteger(at) && at >= 0 ? at : rows.length;
    if (index > rows.length + 100_000) break;
    const out: string[] = [];
    let next = 0;
    for (const c of kids(row, "c")) {
      if (++cells > MAX_CELLS) throw new SpreadsheetError("This file is too large to read here. Save a shorter part of it and bring the parts one at a time.");
      const ref = c.getAttribute("r");
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      if (col > 16384) continue;
      const type = c.getAttribute("t") || "n";
      const v = kids(c, "v")[0]?.textContent ?? "";
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = all(c, "t").map((t) => t.textContent || "").join("");
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (type === "str" || type === "e") value = v;
      else if (type === "d") value = v.replace(/T00:00:00(\.0+)?Z?$/, "");
      else if (v !== "" && dateStyles.has(Number(c.getAttribute("s") || 0))) value = excelDate(Number(v), epoch);
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

/** The cell styles that show a date (built-in date formats, or a custom one made of d, m, y and time parts). */
async function xlsxDateStyles(zip: Zip): Promise<Set<number>> {
  const styles = parseXml((await zip.text("xl/styles.xml")) || "<styleSheet/>");
  const custom = new Map(all(styles, "numFmt").map((f) => [Number(f.getAttribute("numFmtId")), f.getAttribute("formatCode") || ""]));
  const isDate = (id: number) => {
    if (BUILT_IN_DATES.has(id)) return true;
    const code = custom.get(id);
    if (!code) return false;
    const bare = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
    return /[dy]/i.test(bare) || /(^|[^a-z])m+([^a-z]|$)/i.test(bare) && /[dhys]/i.test(bare);
  };
  const xfs = all(styles, "cellXfs")[0];
  const out = new Set<number>();
  if (xfs) kids(xfs, "xf").forEach((xf, i) => { if (isDate(Number(xf.getAttribute("numFmtId") || 0))) out.add(i); });
  return out;
}

/** An Excel date number as YYYY-MM-DD, or YYYY-MM-DD HH:MM:SS when it carries a time. */
function excelDate(serial: number, epoch: number): string {
  if (!Number.isFinite(serial)) return "";
  const ms = epoch + Math.round(serial * 86_400_000);
  const iso = new Date(ms).toISOString();
  return serial % 1 === 0 ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

// ---- OpenDocument (.ods): the first table's cells. ----

async function odsRows(zip: Zip): Promise<string[][]> {
  const doc = parseXml((await zip.text("content.xml"))!);
  const table = all(doc, "table")[0];
  if (!table) return [];
  const rows: string[][] = [];
  let cells = 0;
  const attr = (el: Element, name: string) => [...el.attributes].find((a) => a.localName === name)?.value ?? null;
  for (const row of all(table, "table-row")) {
    const out: string[] = [];
    for (const c of [...row.children].filter((e) => e.localName === "table-cell" || e.localName === "covered-table-cell")) {
      const type = attr(c, "value-type");
      let value = "";
      if (type === "date") value = (attr(c, "date-value") || "").replace(/T00:00:00(\.0+)?$/, "").replace("T", " ");
      else if (type === "float" || type === "currency" || type === "percentage") value = numberText(attr(c, "value") || "");
      else if (type === "boolean") value = attr(c, "boolean-value") === "true" ? "TRUE" : "FALSE";
      else value = kids(c, "p").map(odsText).join("\n");
      // A run of empty cells is written once with a repeat count (often thousands, to the sheet's edge).
      const repeat = Math.min(Number(attr(c, "number-columns-repeated")) || 1, value === "" ? 1024 : 16384);
      for (let i = 0; i < repeat; i++) out.push(value);
      cells += repeat;
      if (cells > MAX_CELLS) throw new SpreadsheetError("This file is too large to read here. Save a shorter part of it and bring the parts one at a time.");
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
