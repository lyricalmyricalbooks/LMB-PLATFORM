// The files of a press's data export (code plan 19.16): spreadsheet (CSV) files a press can open in any spreadsheet app,
// and one zip that holds them all, written without any library. Pure, so the shapes are tested on their own.

/** Field names that hold a password or a sign-in secret: never put in an export, at any depth. */
const PRIVATE_FIELD = /secret|password|passcode|token|privatekey|apikey|accesskey|signingkey|tokenhash/i;

/** A copy of a document without its private fields (see PRIVATE_FIELD). */
export function withoutPrivate(value) {
  if (Array.isArray(value)) return value.map(withoutPrivate);
  if (!isPlain(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !PRIVATE_FIELD.test(key)).map(([key, v]) => [key, withoutPrivate(v)]));
}

function isPlain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && typeof value.toDate !== "function";
}

/** A value as a cell: times as ISO text, lists and deeper records as JSON, nothing as empty. */
function cellValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

/** A document's fields one level deep as columns: { a: { b: 1 } } -> { "a.b": 1 }; lists stay one cell. */
export function flatten(doc, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(doc ?? {})) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (isPlain(value) && Object.keys(value).length && !prefix) flatten(value, name, out);
    else out[name] = cellValue(value);
  }
  return out;
}

/**
 * One cell, quoted when it needs to be. Text that a spreadsheet would run as a formula (starting with =, +, -, @, a
 * tab or a return) gets a leading apostrophe, so opening the file never runs anything; numbers are left alone.
 */
export function csvCell(value) {
  if (value === "" || value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Rows of { id, data } as a CSV text: an `id` column, then every field (one level deep) in the order first seen. An
 * empty list still has its header, so every file opens. `lead` puts more columns before the fields (like a book id).
 */
export function toCsv(rows, { lead = [] } = {}) {
  const flat = rows.map((row) => ({ ...Object.fromEntries(lead.map((k) => [k, cellValue(row[k])])), id: cellValue(row.id), ...flatten(withoutPrivate(row.data ?? {})) }));
  const columns = [...lead, "id"];
  for (const row of flat) for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  const lines = [columns.map(csvCell).join(","), ...flat.map((row) => columns.map((c) => csvCell(row[c])).join(","))];
  // A byte-order mark so spreadsheet apps read accents and other letters right.
  return `﻿${lines.join("\r\n")}\r\n`;
}

// ── A zip, stored without compression (spreadsheet files are small; every computer opens these) ──

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date, as zip files keep them. */
function dosTime(date) {
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2);
  const day = ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, day };
}

/** One zip holding `files` ([{ name, content }], content as text or bytes), all made at `date`. */
export function zipFiles(files, date = new Date()) {
  const { time, day } = dosTime(date);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content), "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** The names and contents in a stored zip (zipFiles' own), for checking one. */
export function readZip(buffer) {
  const files = [];
  let at = 0;
  while (buffer.readUInt32LE(at) === 0x04034b50) {
    const size = buffer.readUInt32LE(at + 18);
    const nameLength = buffer.readUInt16LE(at + 26);
    const extra = buffer.readUInt16LE(at + 28);
    const name = buffer.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength + extra;
    const content = buffer.subarray(start, start + size);
    files.push({ name, content: content.toString("utf8"), crcOk: crc32(content) === buffer.readUInt32LE(at + 14) });
    at = start + size;
  }
  return files;
}
