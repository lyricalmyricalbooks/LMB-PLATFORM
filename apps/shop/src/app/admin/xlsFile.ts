// Older Excel files (.xls, Excel 97 to 2003) read directly (plan 23.40), with no added library. Such a file is a
// "compound file" (a small file system of 512-byte sectors) holding a "Workbook" stream of BIFF8 records: sheet names,
// a shared table of words, number formats and one record per cell. Only what a shop's export uses is read: text,
// numbers, dates, true/false and formula results. Charts, styles and pictures are skipped.
import { MAX_CELLS, SpreadsheetError, TOO_LARGE, excelDate, excelEpoch, isBuiltInDate, isBuiltInPercent, isDateCode, isPercentCode, numberText, percentText, type Book } from "./spreadsheetCells";

const DAMAGED = "This older Excel file (.xls) couldn't be opened. In Excel choose File › Save As › Excel Workbook (.xlsx), and choose that file instead.";
const ENCRYPTED = "This Excel file is protected with a password. Open it in Excel, remove the password (File › Info › Protect Workbook), save it and choose it again.";
const END = 0xfffffffe;

// ---- The compound file: find the Workbook stream. ----

function workbookStream(bytes: Uint8Array): Uint8Array {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 512) throw new SpreadsheetError(DAMAGED);
  const sectorSize = 1 << v.getUint16(30, true);
  const miniSize = 1 << v.getUint16(32, true);
  if (sectorSize !== 512 && sectorSize !== 4096) throw new SpreadsheetError(DAMAGED);
  const sectors = Math.floor((bytes.length - sectorSize) / sectorSize) + 1;
  const at = (n: number) => (n + 1) * sectorSize;
  const u32 = (o: number) => (o + 4 <= bytes.length ? v.getUint32(o, true) : END);

  // The FAT's own sectors are listed in the header, then in a chain of DIFAT sectors.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) { const s = u32(76 + i * 4); if (s < sectors) fatSectors.push(s); }
  for (let s = u32(68), guard = 0; s < sectors && guard < sectors; guard++) {
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per; i++) { const f = u32(at(s) + i * 4); if (f < sectors) fatSectors.push(f); }
    s = u32(at(s) + per * 4);
  }
  const fat: number[] = [];
  for (const s of fatSectors) for (let i = 0; i < sectorSize / 4; i++) fat.push(u32(at(s) + i * 4));

  const chain = (start: number, table: number[], limit: number) => {
    const out: number[] = [];
    for (let s = start; s < limit && out.length <= limit; s = table[s] ?? END) out.push(s);
    return out;
  };
  const read = (start: number, size: number) => {
    const out = new Uint8Array(size);
    let n = 0;
    for (const s of chain(start, fat, sectors)) {
      const piece = bytes.subarray(at(s), Math.min(at(s) + sectorSize, bytes.length));
      out.set(piece.subarray(0, Math.min(piece.length, size - n)), n);
      n += piece.length;
      if (n >= size) break;
    }
    return out;
  };

  // Directory entries are 128 bytes: a UTF-16 name, a type, a first sector and a size.
  const dirBytes = read(u32(48), chain(u32(48), fat, sectors).length * sectorSize);
  const dv = new DataView(dirBytes.buffer);
  const entries: { name: string; type: number; start: number; size: number }[] = [];
  for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
    const length = dv.getUint16(o + 64, true);
    const name = String.fromCharCode(...Array.from({ length: Math.max(0, Math.min(32, length / 2) - 1) }, (_, i) => dv.getUint16(o + i * 2, true)));
    entries.push({ name, type: dv.getUint8(o + 66), start: dv.getUint32(o + 116, true), size: dv.getUint32(o + 120, true) });
  }
  if (entries.some((e) => e.name === "EncryptionInfo")) throw new SpreadsheetError(ENCRYPTED);
  const book = entries.find((e) => e.type === 2 && (e.name === "Workbook" || e.name === "Book"));
  if (!book) throw new SpreadsheetError(DAMAGED);
  if (book.size >= v.getUint32(56, true)) return read(book.start, book.size);

  // A small stream lives in the mini stream, in 64-byte pieces chained by the mini FAT.
  const root = entries[0];
  const miniStream = read(root.start, root.size);
  const miniFatBytes = read(u32(60), v.getUint32(64, true) * sectorSize);
  const mv = new DataView(miniFatBytes.buffer);
  const miniFat = Array.from({ length: miniFatBytes.length / 4 }, (_, i) => mv.getUint32(i * 4, true));
  const out = new Uint8Array(book.size);
  let n = 0;
  for (const s of chain(book.start, miniFat, miniStream.length / miniSize)) {
    out.set(miniStream.subarray(s * miniSize, s * miniSize + Math.min(miniSize, book.size - n)), n);
    n += miniSize;
    if (n >= book.size) break;
  }
  return out;
}

// ---- BIFF8 records. ----

type Rec = { type: number; data: Uint8Array; next: Uint8Array[] };

function records(stream: Uint8Array): Rec[] {
  const out: Rec[] = [];
  const v = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  for (let o = 0; o + 4 <= stream.length;) {
    const type = v.getUint16(o, true);
    const length = v.getUint16(o + 2, true);
    const data = stream.subarray(o + 4, Math.min(o + 4 + length, stream.length));
    // CONTINUE carries on the record before it (long word tables are split this way).
    if (type === 0x003c && out.length) out[out.length - 1].next.push(data);
    else out.push({ type, data, next: [] });
    o += 4 + length;
  }
  return out;
}

const latin1 = new TextDecoder("windows-1252");
const utf16 = new TextDecoder("utf-16le");

/** Reads the words of a record that may run on into CONTINUE records; each continuation restarts a string's characters with a flag byte. */
class Words {
  private parts: Uint8Array[];
  private part = 0;
  private at = 0;
  constructor(first: Uint8Array, rest: Uint8Array[]) { this.parts = [first, ...rest]; }
  private get bytes() { return this.parts[this.part]; }
  private ensure() { while (this.part < this.parts.length && this.at >= this.bytes.length) { this.part++; this.at = 0; } }
  done() { this.ensure(); return this.part >= this.parts.length; }
  u8() { this.ensure(); if (this.done()) throw new SpreadsheetError(DAMAGED); return this.bytes[this.at++]; }
  u16() { return this.u8() | (this.u8() << 8); }
  u32() { return (this.u16() | (this.u16() << 16)) >>> 0; }
  skip(n: number) { for (let left = n; left > 0;) { this.ensure(); if (this.done()) return; const take = Math.min(left, this.bytes.length - this.at); this.at += take; left -= take; } }
  /** `count` characters; where they run on into the next CONTINUE, it starts with a fresh flag byte. */
  text(count: number, flags: number): string {
    let wide = (flags & 1) === 1;
    let out = "";
    for (let left = count; left > 0 && this.part < this.parts.length;) {
      if (this.at >= this.bytes.length) {
        this.part++; this.at = 0;
        if (this.part >= this.parts.length) break;
        wide = (this.bytes[this.at++] & 1) === 1;
        continue;
      }
      const take = Math.min(left, Math.floor((this.bytes.length - this.at) / (wide ? 2 : 1)));
      if (take <= 0) { this.at = this.bytes.length; continue; }
      const slice = this.bytes.subarray(this.at, this.at + take * (wide ? 2 : 1));
      out += wide ? utf16.decode(slice) : latin1.decode(slice);
      this.at += slice.length;
      left -= take;
    }
    return out;
  }
  richString(): string {
    const count = this.u16();
    const flags = this.u8();
    const runs = flags & 8 ? this.u16() : 0;
    const ext = flags & 4 ? this.u32() : 0;
    const s = this.text(count, flags);
    this.skip(runs * 4 + ext);
    return s;
  }
}

/** A short string inside one record: 8- or 16-bit length, a flag byte, then the characters. */
function plainString(data: Uint8Array, at: number, wideLength: boolean): string {
  const count = wideLength ? data[at] | (data[at + 1] << 8) : data[at];
  const o = at + (wideLength ? 2 : 1);
  const wide = (data[o] & 1) === 1;
  const body = data.subarray(o + 1, o + 1 + count * (wide ? 2 : 1));
  return wide ? utf16.decode(body) : latin1.decode(body);
}

/** An RK number: a 30-bit integer or the top of a double, maybe divided by 100. */
function rk(value: number): number {
  let n: number;
  if (value & 2) n = value >> 2;
  else { const b = new DataView(new ArrayBuffer(8)); b.setUint32(4, value & 0xfffffffc, true); n = b.getFloat64(0, true); }
  return value & 1 ? n / 100 : n;
}

/** The workbook's sheets, read from an .xls file's bytes. */
export function xlsBook(bytes: Uint8Array): Book {
  const recs = records(workbookStream(bytes));
  const bof = recs[0];
  if (!bof || bof.type !== 0x0809 || (bof.data[0] | (bof.data[1] << 8)) !== 0x0600) {
    throw new SpreadsheetError("This Excel file is older than Excel 97. Open it in Excel or LibreOffice, save it as Excel Workbook (.xlsx), and choose that file instead.");
  }
  if (recs.some((r) => r.type === 0x002f)) throw new SpreadsheetError(ENCRYPTED);

  const words: string[] = [];
  const formats = new Map<number, string>();
  const xfFormat: number[] = [];
  const sheets: { name: string; hidden: boolean; start: number; type: number }[] = [];
  let is1904 = false;
  // Records are found again by their byte offset in the stream, which BOUNDSHEET gives for each sheet.
  const offsets: number[] = [];
  for (let i = 0, o = 0; i < recs.length; i++) { offsets.push(o); o += 4 + recs[i].data.length + recs[i].next.reduce((n, d) => n + 4 + d.length, 0); }

  for (const r of recs) {
    const d = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength);
    if (r.type === 0x000a) break; // the workbook part ends; sheets follow
    if (r.type === 0x0085 && r.data.length >= 8) sheets.push({ start: d.getUint32(0, true), hidden: r.data[4] !== 0, type: r.data[5], name: plainString(r.data, 6, false) });
    else if (r.type === 0x0022 && r.data.length >= 2) is1904 = d.getUint16(0, true) === 1;
    else if (r.type === 0x041e && r.data.length >= 5) formats.set(d.getUint16(0, true), plainString(r.data, 2, true));
    else if (r.type === 0x00e0 && r.data.length >= 4) xfFormat.push(d.getUint16(2, true));
    else if (r.type === 0x00fc && r.data.length >= 8) {
      const w = new Words(r.data, r.next);
      w.skip(4);
      const unique = w.u32();
      for (let i = 0; i < unique && !w.done(); i++) words.push(w.richString());
    }
  }
  const epoch = excelEpoch(is1904);
  const isDateXf = (xf: number) => { const f = xfFormat[xf]; return f !== undefined && (isBuiltInDate(f) || isDateCode(formats.get(f) || "")); };
  const isPercentXf = (xf: number) => { const f = xfFormat[xf]; return f !== undefined && (isBuiltInPercent(f) || isPercentCode(formats.get(f) || "")); };
  const number = (n: number, xf: number) => (isDateXf(xf) ? excelDate(n, epoch) : isPercentXf(xf) ? percentText(String(n)) : numberText(String(n)));

  const rowsOf = (start: number): string[][] => {
    const first = offsets.indexOf(start);
    if (first < 0) throw new SpreadsheetError(DAMAGED);
    const rows: string[][] = [];
    let cells = 0;
    let pendingFormula: [number, number] | null = null;
    const put = (row: number, col: number, value: string) => {
      if (++cells > MAX_CELLS) throw new SpreadsheetError(TOO_LARGE);
      if (col > 16384 || row > 1_048_576) return;
      while (rows.length <= row) rows.push([]);
      const r = rows[row];
      while (r.length < col) r.push("");
      r[col] = value;
    };
    for (let i = first + 1; i < recs.length; i++) {
      const { type, data } = recs[i];
      if (type === 0x000a) break;
      if (type === 0x0207) {
        if (pendingFormula && data.length >= 3) {
          const w = new Words(data, recs[i].next);
          const count = w.u16();
          put(pendingFormula[0], pendingFormula[1], w.text(count, w.u8()));
        }
        pendingFormula = null;
        continue;
      }
      if (data.length < 6) continue;
      const d = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const row = d.getUint16(0, true);
      const col = d.getUint16(2, true);
      const xf = d.getUint16(4, true);
      if (type === 0x00fd && data.length >= 10) put(row, col, words[d.getUint32(6, true)] ?? "");
      else if (type === 0x0203 && data.length >= 14) put(row, col, number(d.getFloat64(6, true), xf));
      else if (type === 0x027e && data.length >= 10) put(row, col, number(rk(d.getUint32(6, true)), xf));
      else if (type === 0x00bd) {
        for (let o = 4, c = col; o + 6 <= data.length - 2; o += 6, c++) put(row, c, number(rk(d.getUint32(o + 2, true)), d.getUint16(o, true)));
      } else if (type === 0x0204 && data.length >= 9) put(row, col, plainString(data, 6, true));
      else if (type === 0x0205 && data.length >= 8) put(row, col, data[7] ? "" : data[6] ? "TRUE" : "FALSE");
      else if (type === 0x0006 && data.length >= 14) {
        if (d.getUint16(12, true) !== 0xffff) put(row, col, number(d.getFloat64(6, true), xf));
        else if (data[6] === 0) pendingFormula = [row, col]; // the text comes in the STRING record next
        else if (data[6] === 1) put(row, col, data[8] ? "TRUE" : "FALSE");
      }
    }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  };

  return {
    sheets: sheets.filter((s) => s.type === 0).map((s) => ({ name: s.name, hidden: s.hidden, rows: async () => rowsOf(s.start) })),
  };
}
