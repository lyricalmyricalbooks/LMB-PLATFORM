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
// address or an internal name), only pictures are kept, and nothing over 20 MB is saved.
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

/** Downloads one old address and saves it in this bucket. Returns the new download address. */
async function copyPhoto({ bucket, bucketName, url, fetch }) {
  const again = await existingCopy(bucket, bucketName, url);
  if (again) return again;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  let res;
  try {
    res = await fetch(url, { redirect: "follow", signal: controller?.signal });
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (res.url && !publicHttps(res.url)) throw new Error("moved to an address that isn't allowed");
  if (!res.ok) throw new Error(`the old shop answered ${res.status}`);
  const type = String(res.headers?.get?.("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) throw new Error(`not a photo (${type || "no type"})`);
  const declared = Number(res.headers?.get?.("content-length"));
  if (declared > MAX_BYTES) throw new Error("larger than 20 MB");
  const body = Buffer.from(await res.arrayBuffer());
  if (!body.length) throw new Error("empty file");
  if (body.length > MAX_BYTES) throw new Error("larger than 20 MB");
  const path = `${importedBase(url)}.${ext}`;
  const token = crypto.randomUUID();
  await bucket.file(path).save(body, {
    resumable: false,
    contentType: type,
    metadata: { cacheControl: IMMUTABLE, metadata: { firebaseStorageDownloadTokens: token, importedFrom: url } },
  });
  return downloadUrl(bucketName, path, token);
}

/** Swaps every photo of the book still on an old address in `moved` (old → new) to its copy, in one transaction. */
async function swapPhotos(db, bookId, moved, nowIso) {
  const ref = db.collection("books").doc(bookId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 0;
    const data = snap.data() || {};
    const photos = Array.isArray(data.photos) ? data.photos : [];
    let changed = 0;
    const next = photos.map(p => {
      if (!p || typeof p !== "object" || !moved.has(p.url)) return p;
      changed += 1;
      return { ...p, url: moved.get(p.url), importedFrom: p.url };
    });
    if (!changed) return 0;
    const patch = { photos: next, updatedAt: nowIso };
    if (typeof data.photoUrl === "string" && moved.has(data.photoUrl)) patch.photoUrl = moved.get(data.photoUrl);
    tx.update(ref, patch);
    return changed;
  });
}

/**
 * One pass over the catalog: reads every book once a day (and only recently edited ones in between), copies until
 * `deadline`, and records the run in `systemStatus/photoImport` and, when anything was copied, in `audit-log`.
 */
async function runPhotoImport({ db, bucket, fetch, deadline, now = Date.now(), log = console }) {
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
    for (const photo of Array.isArray(doc.data().photos) ? doc.data().photos : []) {
      if (!needsImport(photo, bucketName)) continue;
      const f = failed[hashOf(photo.url)];
      if (f && now - Date.parse(f.at) < FAILED_RETRY_MS) continue;
      const urls = byBook.get(doc.id) || new Set();
      if (!urls.has(photo.url)) { urls.add(photo.url); found += 1; }
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
        if (!copied.has(url)) copied.set(url, await copyPhoto({ bucket, bucketName, url, fetch }));
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

module.exports = { publicHttps, needsImport, importedBase, copyPhoto, swapPhotos, runPhotoImport, MAX_BYTES };
