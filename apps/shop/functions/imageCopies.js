// Smaller copies of book photos + long browser caching for every picture in Storage (October 2026).
//
// Book photos uploaded since 12 October get resized WebP copies in the browser (admin/bookPhotoUpload.ts)
// and a `srcset` list, so a shop card downloads a ~30 KB copy. The 10 October catalog import predates that:
// its photos are only the original JPG/PNG (300 KB–1 MB each), and every homepage view downloaded all of
// them. `runImageCopies` (scheduled `storageImageSweep`) makes the same copies on the server with sharp,
// next to the original (`products/<stamp>-01.png` → `products/<stamp>-01-480w.webp`), and adds
// `srcset`/`width`/`height` to the book's photo. It never deletes or rewrites a file and never changes the
// photo's `url`, so links already shared keep working.
//
// Firebase Storage serves files with `Cache-Control: private, max-age=0` unless the object says otherwise,
// so returning shoppers downloaded every picture again. Every file name the shop writes is unique
// (timestamp/id in the name, never overwritten), so pictures and videos can be cached for a year:
// `runCacheControl` stamps that on existing objects, and new uploads carry it from the start.
"use strict";

const crypto = require("crypto");

/** Copy widths for book photos — the same ladder as the browser upload (admin/prepareImage.ts BOOK_PHOTO_WIDTHS). */
const BOOK_PHOTO_WIDTHS = [480, 640, 960, 1600, 2400, 3200];
/** Card-sized copies (≤ 960 px) are lighter; product-page copies keep the sharp 0.95 of PR #589. */
const CARD_COPY_MAX = 960;
const qualityFor = w => (w <= CARD_COPY_MAX ? 90 : 95);
const IMMUTABLE = "public, max-age=31536000, immutable";
const FAILED_RETRY_MS = 7 * 24 * 3600 * 1000;
const FULL_SCAN_MS = 24 * 3600 * 1000;
const CACHE_RESCAN_MS = 7 * 24 * 3600 * 1000;
const STATUS_DOC = ["systemStatus", "imageCopies"];
// Folders that never hold shop pictures (or must stay private) are left alone by the cache pass.
const CACHE_SKIP_PREFIXES = ["backups/", "digital-assets/"];

/** Mirrors admin/prepareImage.ts `mediaWidthsFor`: every rung up to the original, plus the original width. */
function widthsFor(originalWidth, ladder = BOOK_PHOTO_WIDTHS) {
  const original = Math.round(originalWidth);
  if (!(original > 0)) return [];
  const widths = ladder.filter(w => w <= original);
  if (original < ladder[ladder.length - 1] && !widths.includes(original)) widths.push(original);
  return widths;
}

/** The object path inside `bucketName` a Firebase download URL points at, or null for any other address. */
function storagePathOf(url, bucketName) {
  if (typeof url !== "string" || !url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.hostname === "firebasestorage.googleapis.com") {
    const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!m || m[1] !== bucketName) return null;
    try { return decodeURIComponent(m[2]); } catch { return null; }
  }
  if (u.hostname === "storage.googleapis.com") {
    const [, bucket, ...rest] = u.pathname.split("/");
    if (bucket !== bucketName || !rest.length) return null;
    try { return decodeURIComponent(rest.join("/")); } catch { return null; }
  }
  return null;
}

/** `products/1791667400437-01.png` → `products/1791667400437-01-480w.webp`. */
function copyPath(path, width) {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  const base = dot > slash ? path.slice(0, dot) : path;
  return `${base}-${width}w.webp`;
}

/** The same address shape `getDownloadURL` returns, for a file saved with that download token. */
function downloadUrl(bucketName, path, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

function hasSrcset(photo) {
  return Array.isArray(photo?.srcset) && photo.srcset.some(v => v && typeof v.url === "string" && v.url && Number(v.w) > 0);
}

/** A book photo still served only as its original: a Storage picture with no copies (videos are left alone). */
function needsCopies(photo, bucketName) {
  if (!photo || typeof photo !== "object" || hasSrcset(photo) || photo.videoUrl) return false;
  const path = storagePathOf(photo.url, bucketName);
  return !!path && !/\.(gif|svg)$/i.test(path);
}

const failKey = path => crypto.createHash("sha1").update(path).digest("hex").slice(0, 20);

/**
 * Makes the copies for one Storage picture and returns `{ width, height, srcset }`. A copy that would be
 * as heavy as the original is skipped and the original itself becomes the largest entry instead (small
 * originals re-encoded at 0.95 can grow), so no shopper ever downloads more than before.
 */
async function makeCopies({ bucket, bucketName, path, originalUrl, sharp }) {
  const file = bucket.file(path);
  const [buffer] = await file.download();
  const image = sharp(buffer, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  if (!/^(jpeg|png|webp)$/.test(meta.format || "")) throw new Error(`not a photo (${meta.format || "unknown"})`);
  // EXIF orientations 5–8 swap the sides.
  const swap = (meta.orientation || 1) >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;
  if (!(width > 0 && height > 0)) throw new Error("unreadable size");
  const srcset = [];
  for (const w of widthsFor(width)) {
    const out = await sharp(buffer, { failOn: "none" }).rotate().resize({ width: w }).webp({ quality: qualityFor(w), effort: 5 }).toBuffer();
    if (out.length >= buffer.length && (meta.format === "jpeg" || meta.format === "webp" || w === width)) {
      srcset.push({ url: originalUrl, w: width });
      break;
    }
    const target = copyPath(path, w);
    const token = crypto.randomUUID();
    await bucket.file(target).save(out, {
      resumable: false,
      contentType: "image/webp",
      metadata: { cacheControl: IMMUTABLE, metadata: { firebaseStorageDownloadTokens: token, madeFrom: path } },
    });
    srcset.push({ url: downloadUrl(bucketName, target, token), w });
  }
  return { width, height, srcset };
}

/** Puts the copies on every photo of the book that still has that `url` and no copies (one transaction). */
async function attachCopies(db, bookId, url, made) {
  const ref = db.collection("books").doc(bookId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const photos = Array.isArray(snap.data().photos) ? snap.data().photos : [];
    let changed = false;
    const next = photos.map(p => {
      if (!p || typeof p !== "object" || p.url !== url || hasSrcset(p)) return p;
      changed = true;
      return { ...p, srcset: made.srcset, width: made.width, height: made.height };
    });
    if (changed) tx.update(ref, { photos: next });
    return changed;
  });
}

/**
 * One pass over the catalog. Reads every book once a day (and only recently edited ones in between),
 * works until `deadline`, and remembers pictures that can't be read so they aren't retried every run.
 */
async function runImageCopies({ db, bucket, sharp, deadline, now = Date.now(), log = console }) {
  const bucketName = bucket.name;
  const statusRef = db.collection(STATUS_DOC[0]).doc(STATUS_DOC[1]);
  const status = (await statusRef.get()).data() || {};
  const full = !status.fullScanAt || now - Date.parse(status.fullScanAt) > FULL_SCAN_MS || status.pending > 0;
  const query = full || !status.scanStartedAt
    ? db.collection("books")
    : db.collection("books").where("updatedAt", ">=", status.scanStartedAt);
  const scanStartedAt = new Date(now).toISOString();
  const snap = await query.get();
  const failed = { ...(status.failed || {}) };
  const jobs = [];
  const seen = new Set();
  for (const doc of snap.docs) {
    for (const photo of Array.isArray(doc.data().photos) ? doc.data().photos : []) {
      if (!needsCopies(photo, bucketName)) continue;
      const path = storagePathOf(photo.url, bucketName);
      const f = failed[failKey(path)];
      if (f && now - Date.parse(f.at) < FAILED_RETRY_MS) continue;
      const key = `${doc.id}|${photo.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push({ bookId: doc.id, url: photo.url, path });
    }
  }
  let done = 0;
  const made = new Map(); // one set of copies per picture, even when two books share it
  for (const job of jobs) {
    if (Date.now() > deadline) break;
    try {
      let copies = made.get(job.path);
      if (!copies) {
        copies = await makeCopies({ bucket, bucketName, path: job.path, originalUrl: job.url, sharp });
        made.set(job.path, copies);
      }
      await attachCopies(db, job.bookId, job.url, copies);
      delete failed[failKey(job.path)];
      done += 1;
    } catch (err) {
      log.warn?.(`imageCopies: ${job.path}: ${err.message}`);
      failed[failKey(job.path)] = { path: job.path, reason: String(err.message || err).slice(0, 200), at: new Date(now).toISOString() };
    }
  }
  const pending = jobs.length - done;
  await statusRef.set({
    lastRunAt: new Date(now).toISOString(),
    ...(full && pending === 0 ? { fullScanAt: scanStartedAt } : {}),
    scanStartedAt: pending === 0 ? scanStartedAt : (status.scanStartedAt || null),
    pending,
    copiedTotal: (status.copiedTotal || 0) + done,
    failed,
  }, { merge: true });
  return { found: jobs.length, done, pending };
}

/** Whether a Storage object is a picture or video that should carry the year-long cache header. */
function wantsLongCache(file) {
  const name = file.name || "";
  if (CACHE_SKIP_PREFIXES.some(p => name.startsWith(p)) || name.endsWith("/")) return false;
  const type = file.metadata?.contentType || "";
  if (!/^(image|video)\//.test(type)) return false;
  return !String(file.metadata?.cacheControl || "").includes("max-age=31536000");
}

/** Stamps the year-long cache header on pictures/videos that don't have it, a page at a time across runs. */
async function runCacheControl({ db, bucket, deadline, now = Date.now(), log = console }) {
  const statusRef = db.collection(STATUS_DOC[0]).doc(STATUS_DOC[1]);
  const status = (await statusRef.get()).data() || {};
  const cache = status.cache || {};
  if (cache.doneAt && !cache.pageToken && now - Date.parse(cache.doneAt) < CACHE_RESCAN_MS) return { skipped: true };
  let pageToken = cache.pageToken || undefined;
  let updated = 0;
  let finished = false;
  while (Date.now() < deadline) {
    const [files, next] = await bucket.getFiles({ autoPaginate: false, maxResults: 500, pageToken });
    let cut = false;
    for (const file of files) {
      // Out of time mid-page: keep this page's token so the next run starts it again (done files are skipped).
      if (Date.now() > deadline) { cut = true; break; }
      if (!wantsLongCache(file)) continue;
      try { await file.setMetadata({ cacheControl: IMMUTABLE }); updated += 1; }
      catch (err) { log.warn?.(`cacheControl: ${file.name}: ${err.message}`); }
    }
    if (cut) break;
    pageToken = next?.pageToken;
    if (!pageToken) { finished = true; break; }
  }
  await statusRef.set({
    cache: {
      pageToken: finished ? null : (pageToken || null),
      ...(finished ? { doneAt: new Date(now).toISOString() } : { doneAt: cache.doneAt || null }),
      updatedTotal: (cache.updatedTotal || 0) + updated,
    },
  }, { merge: true });
  return { updated, finished };
}

module.exports = {
  BOOK_PHOTO_WIDTHS, CARD_COPY_MAX, IMMUTABLE, qualityFor, widthsFor, storagePathOf, copyPath, downloadUrl,
  needsCopies, makeCopies, attachCopies, runImageCopies, wantsLongCache, runCacheControl,
};
