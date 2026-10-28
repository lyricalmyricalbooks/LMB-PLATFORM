// Imported photos into the shop's own Storage (plan 3.1b, October 2026).
//
// Books › Import CSV (and an old shop's product export, admin/shopMove.ts) saves each photo as the address it had
// on the old shop. Those pictures vanish when the old shop closes. `runPhotoImport` (in the hourly
// `storageImageSweep`, before the photo copies) downloads every book photo that still lives on another address,
// saves it in this shop's bucket under `products/imported/<hash of the address>.<ext>`, and swaps the photo's `url`
// to the new file, keeping the old one as `importedFrom`. `imageCopies.js` then makes the smaller copies as for any
// upload.
//
// Safe to re-run: the file name comes from the old address, so a second run finds the file already saved and reuses
// it; a photo already in this bucket is skipped; the swap is a transaction that only touches photos still on the
// old address. Addresses that can't be read are remembered and retried after a week. Each run that copies anything
// leaves one line in the shop's audit log. Only https addresses on public host names are fetched (never an IP
// address, an internal name or a name that points at a private address; redirects are checked hop by hop), only
// pictures are kept, nothing over 20 MB is read, and the 20-second limit covers the whole download.
//
// Pictures inside a book's description (plan 5.5): an imported description can carry `<img src="…">` tags pointing
// at the old shop. Those addresses are copied with the same rules and the same file names, and the description is
// rewritten in the same transaction as the photos, only where the tag still points at the old address. Each rewritten
// picture is listed in the book's `descriptionImages` as `{ url, importedFrom }`, so the old address is kept.
"use strict";

const crypto = require("crypto");
const { storagePathOf, IMMUTABLE } = require("./imageCopies");

const STATUS_DOC = ["systemStatus", "photoImport"];
const MAX_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const FAILED_RETRY_MS = 7 * 24 * 3600 * 1000;
const FULL_SCAN_MS = 24 * 3600 * 1000;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };

/** True for an https address on a public host name: never a bare IP, localhost or an internal name. */
function publicHttps(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".")) return false;
  if (/^[\d.]+$/.test(host) || host.startsWith("[")) return false;
  if (host === "localhost" || /\.(localhost|internal|local|lan|home|corp)$/.test(host)) return false;
  return true;
}

/** A photo that still loads from another address (not a video, not already in this bucket). */
function needsImport(photo, bucketName) {
  if (!photo || typeof photo !== "object" || photo.videoUrl || typeof photo.url !== "string") return false;
  if (storagePathOf(photo.url, bucketName)) return false;
  return publicHttps(photo.url);
}

const IMG_SRC_RE = /(<img\b[^>]*?\ssrc\s*=\s*)("([^"]*)"|'([^']*)')/gi;
const unescapeAttr = v => v.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
const escapeAttr = v => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** The old-shop addresses of the `<img>` pictures in a description that still need copying. */
function descriptionImages(text, bucketName) {
  if (typeof text !== "string" || !/<img\b/i.test(text)) return [];
  const urls = new Set();
  for (const m of text.matchAll(IMG_SRC_RE)) {
    const url = unescapeAttr((m[3] ?? m[4] ?? "").trim());
    if (needsImport({ url }, bucketName)) urls.add(url);
  }
  return [...urls];
}

/** The description with every `<img>` still on an address in `moved` pointed at its copy, and the swaps made. */
function rewriteDescription(text, moved) {
  const swaps = [];
  const next = text.replace(IMG_SRC_RE, (whole, lead, _q, dq, sq) => {
    const old = unescapeAttr((dq ?? sq ?? "").trim());
    if (!moved.has(old)) return whole;
    swaps.push({ url: moved.get(old), importedFrom: old });
    return `${lead}"${escapeAttr(moved.get(old))}"`;
  });
  return { text: next, swaps };
}

const hashOf = url => crypto.createHash("sha256").update(url).digest("hex").slice(0, 32);

/** Where the copy of `url` lives in this bucket, before its extension is known. */
const importedBase = url => `products/imported/${hashOf(url)}`;

function downloadUrl(bucketName, path, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/** An earlier run's copy of `url`, as its download address, or null. */
async function existingCopy(bucket, bucketName, url) {
  const base = importedBase(url);
  for (const ext of new Set(Object.values(TYPES))) {
    const file = bucket.file(`${base}.${ext}`);
    const [exists] = await file.exists();
    if (!exists) continue;
    const [meta] = await file.getMetadata();
    const token = String(meta?.metadata?.firebaseStorageDownloadTokens || "").split(",")[0];
    if (token) return downloadUrl(bucketName, file.name, token);
  }
  return null;
}

/** True for an address no outside fetch may reach: private, loopback, link-local, shared, multicast or unspecified. */
function privateAddress(address) {
  const a = String(address || "").toLowerCase();
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateAddress(mapped[1]);
  const v4 = a.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [b0, b1] = [Number(v4[1]), Number(v4[2])];
    return b0 === 0 || b0 === 10 || b0 === 127 || b0 >= 224
      || (b0 === 169 && b1 === 254) || (b0 === 172 && b1 >= 16 && b1 <= 31) || (b0 === 192 && b1 === 168)
      || (b0 === 100 && b1 >= 64 && b1 <= 127);
  }
  if (!a.includes(":")) return true; // not an address at all
  return a === "::" || a === "::1" || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || /^ff/.test(a);
}

const defaultLookup = (host) => require("dns").promises.lookup(host, { all: true, verbatim: true });

/** Refuses an address that isn't public https, or whose host name points at a private address. */
async function checkAddress(url, lookup) {
  if (!publicHttps(url)) throw new Error("moved to an address that isn't allowed");
  const found = await lookup(new URL(url).hostname);
  const list = Array.isArray(found) ? found : [found];
  if (!list.length || list.some(r => privateAddress(r?.address))) throw new Error("the address points inside a private network");
}

/** Reads the body, stopping as soon as it passes `MAX_BYTES` (whether or not the size was declared). */
async function readCapped(res) {
  const reader = res.body?.getReader?.();
  if (!reader) {
    const whole = Buffer.from(await res.arrayBuffer());
    if (whole.length > MAX_BYTES) throw new Error("larger than 20 MB");
    return whole;
  }
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      try { await reader.cancel(); } catch { /* already closed */ }
      throw new Error("larger than 20 MB");
    }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts);
}

const MAX_REDIRECTS = 3;

/**
 * Downloads one old address and saves it in this bucket. Returns the new download address. Redirects are followed by
 * hand (at most three), each new address checked before it is requested, and the time limit covers reading the body.
 * Known gap: the host name is looked up here and again by `fetch`, so a name that changes its answer in between could
 * still reach a private address.
 */
async function copyPhoto({ bucket, bucketName, url, fetch, lookup = defaultLookup, timeoutMs = FETCH_TIMEOUT_MS }) {
  const again = await existingCopy(bucket, bucketName, url);
  if (again) return again;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let type, body;
  try {
    let current = url;
    let res;
    for (let hop = 0; ; hop += 1) {
      await checkAddress(current, lookup);
      res = await fetch(current, { redirect: "manual", signal: controller.signal });
      if (![301, 302, 303, 307, 308].includes(res.status)) break;
      const next = res.headers?.get?.("location");
      if (!next || hop >= MAX_REDIRECTS) throw new Error("too many moves");
      current = new URL(next, current).href;
    }
    if (!res.ok) throw new Error(`the old shop answered ${res.status}`);
    type = String(res.headers?.get?.("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!TYPES[type]) throw new Error(`not a photo (${type || "no type"})`);
    const declared = Number(res.headers?.get?.("content-length"));
    if (declared > MAX_BYTES) throw new Error("larger than 20 MB");
    body = await readCapped(res);
  } catch (err) {
    if (controller.signal.aborted) throw new Error("the old shop took too long to answer");
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!body.length) throw new Error("empty file");
  const ext = TYPES[type];
  const path = `${importedBase(url)}.${ext}`;
  const token = crypto.randomUUID();
  await bucket.file(path).save(body, {
    resumable: false,
    contentType: type,
    metadata: { cacheControl: IMMUTABLE, metadata: { firebaseStorageDownloadTokens: token, importedFrom: url } },
  });
  return downloadUrl(bucketName, path, token);
}

/**
 * Swaps every photo and description picture of the book still on an old address in `moved` (old → new) to its copy,
 * in one transaction. Returns how many old addresses were swapped.
 */
async function swapPhotos(db, bookId, moved, nowIso) {
  const ref = db.collection("books").doc(bookId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 0;
    const data = snap.data() || {};
    const photos = Array.isArray(data.photos) ? data.photos : [];
    const swapped = new Set(); // old addresses swapped on this book, so a picture used twice counts once
    const patch = {};
    const next = photos.map(p => {
      if (!p || typeof p !== "object" || !moved.has(p.url)) return p;
      swapped.add(p.url);
      return { ...p, url: moved.get(p.url), importedFrom: p.url };
    });
    if (swapped.size) patch.photos = next;
    if (typeof data.description === "string") {
      const { text, swaps } = rewriteDescription(data.description, moved);
      if (swaps.length) {
        patch.description = text;
        const kept = Array.isArray(data.descriptionImages) ? data.descriptionImages : [];
        const listed = new Set(kept.map(k => k?.url));
        const added = [];
        for (const sw of swaps) {
          swapped.add(sw.importedFrom);
          if (!listed.has(sw.url)) { listed.add(sw.url); added.push(sw); }
        }
        patch.descriptionImages = [...kept, ...added];
      }
    }
    if (!swapped.size) return 0;
    patch.updatedAt = nowIso;
    if (typeof data.photoUrl === "string" && moved.has(data.photoUrl)) patch.photoUrl = moved.get(data.photoUrl);
    tx.update(ref, patch);
    return swapped.size;
  });
}

/**
 * One pass over the catalog: reads every book once a day (and only recently edited ones in between), copies until
 * `deadline`, and records the run in `systemStatus/photoImport` and, when anything was copied, in `audit-log`.
 */
async function runPhotoImport({ db, bucket, fetch, lookup = defaultLookup, timeoutMs = FETCH_TIMEOUT_MS, deadline, now = Date.now(), log = console }) {
  if (typeof fetch !== "function") throw new Error("runPhotoImport needs a fetch");
  const bucketName = bucket.name;
  const nowIso = new Date(now).toISOString();
  const statusRef = db.collection(STATUS_DOC[0]).doc(STATUS_DOC[1]);
  const status = (await statusRef.get()).data() || {};
  const full = !status.fullScanAt || now - Date.parse(status.fullScanAt) > FULL_SCAN_MS || status.pending > 0;
  const query = full || !status.scanStartedAt
    ? db.collection("books")
    : db.collection("books").where("updatedAt", ">=", status.scanStartedAt);
  const snap = await query.get();
  const failed = { ...(status.failed || {}) };
  const byBook = new Map();
  let found = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const wanted = (Array.isArray(data.photos) ? data.photos : []).filter(p => needsImport(p, bucketName)).map(p => p.url)
      .concat(descriptionImages(data.description, bucketName));
    for (const url of wanted) {
      const f = failed[hashOf(url)];
      if (f && now - Date.parse(f.at) < FAILED_RETRY_MS) continue;
      const urls = byBook.get(doc.id) || new Set();
      if (!urls.has(url)) { urls.add(url); found += 1; }
      byBook.set(doc.id, urls);
    }
  }
  const copied = new Map(); // old address → new, shared by every book that used it
  let done = 0, books = 0, failures = 0;
  for (const [bookId, urls] of byBook) {
    if (Date.now() > deadline) break;
    const moved = new Map();
    for (const url of urls) {
      if (Date.now() > deadline) break;
      if (failed[hashOf(url)]?.at === nowIso) { failures += 1; continue; } // failed for another book this run
      try {
        if (!copied.has(url)) copied.set(url, await copyPhoto({ bucket, bucketName, url, fetch, lookup, timeoutMs }));
        moved.set(url, copied.get(url));
        delete failed[hashOf(url)];
      } catch (err) {
        failures += 1;
        log.warn?.(`photoImport: ${url}: ${err.message}`);
        failed[hashOf(url)] = { url: url.slice(0, 500), reason: String(err.message || err).slice(0, 200), at: nowIso };
      }
    }
    if (!moved.size) continue;
    const swapped = await swapPhotos(db, bookId, moved, nowIso);
    if (swapped) { done += swapped; books += 1; }
  }
  const pending = Math.max(0, found - done - failures);
  await statusRef.set({
    lastRunAt: nowIso,
    ...(full && pending === 0 ? { fullScanAt: nowIso } : {}),
    scanStartedAt: pending === 0 ? nowIso : (status.scanStartedAt || null),
    pending,
    copiedTotal: (status.copiedTotal || 0) + done,
    failed,
  }, { merge: true });
  if (done) {
    await db.collection("audit-log").add({
      type: "catalog",
      message: `Copied ${done} imported photo${done === 1 ? "" : "s"} on ${books} book${books === 1 ? "" : "s"} into the shop's own storage`,
      photos: done,
      books,
      createdAt: nowIso,
    }).catch(err => log.warn?.(`photoImport: audit log not written: ${err.message}`));
  }
  return { found, done, books, failed: failures, pending };
}

module.exports = { publicHttps, privateAddress, needsImport, descriptionImages, rewriteDescription, importedBase, copyPhoto, swapPhotos, runPhotoImport, MAX_BYTES };
