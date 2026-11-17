// Digital goods for every kind of shop (Digital D1, 17 November 2026): one copy of the file rules for the admin, the
// storefront and the server (functions/shared/digitalFiles.js).
//
//  - A product (or one of its editions) can carry several files: `digitalFiles: [{ file, name, size }]`, where `file` is
//    the stored name under the shop's digital-assets/ folder and `name` is what buyers see. The older single
//    `digitalFileName` still works: it is read as a one-file list, and the admin keeps it equal to the first file so older
//    pages and orders behave as before.
//  - An edition's own files win; with none, buyers of that edition get the product's files.
//  - Each file is counted on its own against the download limit. The first file keeps the old per-line key, so counts on
//    orders placed before this change carry on.
//  - The shop picks the countries buyers of downloads can be in (Settings › General › Digital downloads). Canada and the
//    US to start; "*" opens every other country too.

export type DigitalFile = { file: string; name?: string; size?: number; version?: number; updated?: string };

/** Most files on one product or edition. */
export const MAX_DIGITAL_FILES = 20;
/** Largest file: 5 GB (plan decision 4; storage.rules refuses anything bigger). */
export const MAX_DIGITAL_FILE_BYTES = 5 * 1024 * 1024 * 1024;
/** Countries buyers of downloads can be in when the shop has not chosen. */
export const DEFAULT_DIGITAL_COUNTRIES = ["CA", "US"];
/** In the countries list: every other country as well. */
export const EVERY_OTHER_COUNTRY = "*";

const SAFE_NAME = /^[^/\\]{1,300}$/;

function cleanFile(raw: any): DigitalFile | null {
  const file = String((raw && raw.file) || "").trim();
  if (!SAFE_NAME.test(file) || file === "." || file === "..") return null;
  const name = String((raw && raw.name) || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const size = Math.floor(Number(raw && raw.size));
  // A file replaced by a newer version (Digital D2b) carries its version number and the day it changed.
  const version = Math.floor(Number(raw && raw.version));
  const updated = String((raw && raw.updated) || "");
  return {
    file, ...(name ? { name } : {}), ...(Number.isFinite(size) && size > 0 ? { size } : {}),
    ...(version > 1 && version < 1000 ? { version } : {}), ...(/^\d{4}-\d{2}-\d{2}$/.test(updated) ? { updated } : {}),
  };
}

/** The files on one product or edition, in order: its list, else its single older file, else none. */
export function filesOf(holder: any): DigitalFile[] {
  const list = Array.isArray(holder && holder.digitalFiles) ? holder.digitalFiles : [];
  const out: DigitalFile[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const f = cleanFile(raw);
    if (!f || seen.has(f.file)) continue;
    seen.add(f.file);
    out.push(f);
    if (out.length >= MAX_DIGITAL_FILES) break;
  }
  if (out.length) return out;
  const single = cleanFile({ file: holder && holder.digitalFileName });
  return single ? [single] : [];
}

/** The files buyers of this edition get: the edition's own, else the product's. */
export function filesFor(book: any, variantId?: string | null): DigitalFile[] {
  const variant = variantId ? ((book && book.variants) || []).find((v: any) => v && v.id === variantId) : null;
  const own = variant ? filesOf(variant) : [];
  return own.length ? own : filesOf(book);
}

/**
 * A file swapped for a new version: the new stored file and size, the same name and place in the list, the version
 * number one up and today's day. Pure.
 */
export function newVersionOf(f: DigitalFile, upload: { file: string; size: number }, today: string): DigitalFile {
  return { ...f, file: upload.file, size: upload.size, version: (f.version || 1) + 1, updated: today };
}

/** What a buyer sees for a file: its name, else the stored name without the upload's time prefix. */
export function fileLabel(f: DigitalFile): string {
  return (f.name || String(f.file || "").replace(/^\d{10,}-/, "")).trim() || "Download";
}

/**
 * The download-count key for file `index` of a line whose old key is `lineKey` (the first file keeps the old key). A new
 * version of the first file starts a fresh count (`__v2`), so buyers who used up their downloads can get it; later files
 * are counted by stored name, which a new version changes anyway.
 */
export function fileCountKey(lineKey: string, files: DigitalFile[], index: number): string {
  if (index <= 0 && files[0]?.version) return `${lineKey}__v${files[0].version}`;
  if (index <= 0 || !files[index]) return lineKey;
  return `${lineKey}__${files[index].file}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300);
}

/** Which files to keep on save: the list cleaned, with the first one mirrored in `digitalFileName` for older readers. */
export function filesPatch(files: DigitalFile[]): { digitalFiles: DigitalFile[]; digitalFileName: string } {
  const clean = filesOf({ digitalFiles: files });
  return { digitalFiles: clean, digitalFileName: clean[0]?.file || "" };
}

/** The shop's chosen countries for downloads (two-letter codes, plus "*" for every other country). */
export function digitalCountries(settings: any): string[] {
  const raw = settings && settings.digitalDownloads && settings.digitalDownloads.countries;
  if (!Array.isArray(raw)) return DEFAULT_DIGITAL_COUNTRIES.slice();
  return [...new Set(raw.map((c: any) => String(c || "").trim().toUpperCase()).filter((c: string) => c === EVERY_OTHER_COUNTRY || /^[A-Z]{2}$/.test(c)))];
}

/** Whether a buyer in `countryCode` (two letters) may buy downloads. An unknown country only passes with "*". */
export function digitalCountryAllowed(settings: any, countryCode: unknown): boolean {
  const list = digitalCountries(settings);
  const code = String(countryCode || "").trim().toUpperCase();
  return list.includes(EVERY_OTHER_COUNTRY) || (/^[A-Z]{2}$/.test(code) && list.includes(code));
}

/** "a few KB" style size for the admin's file list. */
export function fileSizeText(bytes: unknown): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
