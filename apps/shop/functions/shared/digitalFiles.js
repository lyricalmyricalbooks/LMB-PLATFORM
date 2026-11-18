// GENERATED from src/shared/digitalFiles.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PLAYS = exports.PLAY_LINK_MINUTES = exports.EVERY_OTHER_COUNTRY = exports.DEFAULT_DIGITAL_COUNTRIES = exports.MAX_DIGITAL_FILE_BYTES = exports.MAX_DIGITAL_FILES = void 0;
exports.filesOf = filesOf;
exports.filesFor = filesFor;
exports.newVersionOf = newVersionOf;
exports.fileLabel = fileLabel;
exports.fileCountKey = fileCountKey;
exports.filesPatch = filesPatch;
exports.digitalCountries = digitalCountries;
exports.digitalCountryAllowed = digitalCountryAllowed;
exports.fileSizeText = fileSizeText;
exports.mediaKind = mediaKind;
exports.nextPlayCount = nextPlayCount;
/** Most files on one product or edition. */
exports.MAX_DIGITAL_FILES = 20;
/** Largest file: 5 GB (plan decision 4; storage.rules refuses anything bigger). */
exports.MAX_DIGITAL_FILE_BYTES = 5 * 1024 * 1024 * 1024;
/** Countries buyers of downloads can be in when the shop has not chosen. */
exports.DEFAULT_DIGITAL_COUNTRIES = ["CA", "US"];
/** In the countries list: every other country as well. */
exports.EVERY_OTHER_COUNTRY = "*";
const SAFE_NAME = /^[^/\\]{1,300}$/;
function cleanFile(raw) {
    const file = String((raw && raw.file) || "").trim();
    if (!SAFE_NAME.test(file) || file === "." || file === "..")
        return null;
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
function filesOf(holder) {
    const list = Array.isArray(holder && holder.digitalFiles) ? holder.digitalFiles : [];
    const out = [];
    const seen = new Set();
    for (const raw of list) {
        const f = cleanFile(raw);
        if (!f || seen.has(f.file))
            continue;
        seen.add(f.file);
        out.push(f);
        if (out.length >= exports.MAX_DIGITAL_FILES)
            break;
    }
    if (out.length)
        return out;
    const single = cleanFile({ file: holder && holder.digitalFileName });
    return single ? [single] : [];
}
/** The files buyers of this edition get: the edition's own, else the product's. */
function filesFor(book, variantId) {
    const variant = variantId ? ((book && book.variants) || []).find((v) => v && v.id === variantId) : null;
    const own = variant ? filesOf(variant) : [];
    return own.length ? own : filesOf(book);
}
/**
 * A file swapped for a new version: the new stored file and size, the same name and place in the list, the version
 * number one up and today's day. Pure.
 */
function newVersionOf(f, upload, today) {
    return { ...f, file: upload.file, size: upload.size, version: (f.version || 1) + 1, updated: today };
}
/** What a buyer sees for a file: its name, else the stored name without the upload's time prefix. */
function fileLabel(f) {
    return (f.name || String(f.file || "").replace(/^\d{10,}-/, "")).trim() || "Download";
}
/**
 * The download-count key for file `index` of a line whose old key is `lineKey` (the first file keeps the old key). A new
 * version of the first file starts a fresh count (`__v2`), so buyers who used up their downloads can get it; later files
 * are counted by stored name, which a new version changes anyway.
 */
function fileCountKey(lineKey, files, index) {
    if (index <= 0 && files[0]?.version)
        return `${lineKey}__v${files[0].version}`;
    if (index <= 0 || !files[index])
        return lineKey;
    return `${lineKey}__${files[index].file}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300);
}
/** Which files to keep on save: the list cleaned, with the first one mirrored in `digitalFileName` for older readers. */
function filesPatch(files) {
    const clean = filesOf({ digitalFiles: files });
    return { digitalFiles: clean, digitalFileName: clean[0]?.file || "" };
}
/** The shop's chosen countries for downloads (two-letter codes, plus "*" for every other country). */
function digitalCountries(settings) {
    const raw = settings && settings.digitalDownloads && settings.digitalDownloads.countries;
    if (!Array.isArray(raw))
        return exports.DEFAULT_DIGITAL_COUNTRIES.slice();
    return [...new Set(raw.map((c) => String(c || "").trim().toUpperCase()).filter((c) => c === exports.EVERY_OTHER_COUNTRY || /^[A-Z]{2}$/.test(c)))];
}
/** Whether a buyer in `countryCode` (two letters) may buy downloads. An unknown country only passes with "*". */
function digitalCountryAllowed(settings, countryCode) {
    const list = digitalCountries(settings);
    const code = String(countryCode || "").trim().toUpperCase();
    return list.includes(exports.EVERY_OTHER_COUNTRY) || (/^[A-Z]{2}$/.test(code) && list.includes(code));
}
/** "a few KB" style size for the admin's file list. */
function fileSizeText(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0)
        return "";
    if (n < 1024 * 1024)
        return `${Math.max(1, Math.round(n / 1024))} KB`;
    if (n < 1024 * 1024 * 1024)
        return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
const AUDIO = new Set(["mp3", "m4a", "m4b", "aac", "wav", "ogg", "oga", "opus", "flac"]);
const VIDEO = new Set(["mp4", "m4v", "webm", "mov"]);
/** Minutes a play link works. */
exports.PLAY_LINK_MINUTES = 10;
/** Play links one order file may get in a day. */
exports.MAX_PLAYS = 200;
/** "audio", "video", or null for a file that only downloads. Decided by the stored name's extension. */
function mediaKind(fileName) {
    const match = /\.([A-Za-z0-9]{1,5})$/.exec(String(fileName || ""));
    const ext = match ? match[1].toLowerCase() : "";
    return AUDIO.has(ext) ? "audio" : VIDEO.has(ext) ? "video" : null;
}
/** The play count after one more play today (UTC day), or `ok: false` past `MAX_PLAYS`. Older days are dropped. */
function nextPlayCount(counts, key, day, limit = exports.MAX_PLAYS) {
    const all = counts && typeof counts === "object" && !Array.isArray(counts) ? counts : {};
    const today = {};
    const prefix = `${day}|`;
    for (const [k, v] of Object.entries(all))
        if (k.startsWith(prefix) && Number(v) > 0)
            today[k] = Math.floor(Number(v));
    const used = today[prefix + key] || 0;
    if (used >= limit)
        return { ok: false, used, next: today };
    return { ok: true, used: used + 1, next: { ...today, [prefix + key]: used + 1 } };
}
