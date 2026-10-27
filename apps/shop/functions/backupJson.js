// A copy of every Firestore document, written by the Functions themselves (Admin SDK reads + Storage writes).
// It needs no extra IAM role, unlike the managed Firestore export (Cloud Datastore Import Export Admin), so the
// nightly backup still has a usable copy when the export is refused. Restore: scripts/restore-json-backup.mjs.
//
// Layout in the bucket: <folder>/<collection>.ndjson.gz (one {"path","data"} line per document),
// <folder>/_group_<name>.ndjson.gz for sub-collections (books/{id}/private/...), <folder>/backup.json (every document
// in one JSON file, stored gzip-compressed; this is what Settings › Backups & export downloads) and manifest.json last.
const zlib = require("zlib");

/** Collections that are only short-lived counters; restoring them would be wrong, so they are left out. */
const SKIP_COLLECTIONS = ["rate-limits"];
/** Sub-collection names, copied with collection-group reads (firestore.rules lists books/{id}/private only). */
const SUBCOLLECTION_GROUPS = ["private"];
const BACKUP_FORMAT = "lyricalmyrical-firestore-json/1";
/** The one-file copy of a backup folder, offered as a download (backupAdmin.js). */
const DOWNLOAD_FILE = "backup.json";

const isPlainObject = v => v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;

/** Firestore value → JSON-safe value. Special types become { __fs: <type>, … } and are turned back by decodeValue. */
function encodeValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : { __fs: "num", v: String(v) };
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map(encodeValue);
  if (typeof v !== "object") return String(v);
  if (typeof v.toMillis === "function" && "seconds" in v && "nanoseconds" in v) return { __fs: "timestamp", s: Number(v.seconds), n: Number(v.nanoseconds) };
  if (typeof v.latitude === "number" && typeof v.longitude === "number" && !isPlainObject(v)) return { __fs: "geo", lat: v.latitude, lng: v.longitude };
  if (typeof v.path === "string" && typeof v.collection === "function") return { __fs: "ref", path: v.path };
  if (v instanceof Uint8Array) return { __fs: "bytes", b64: Buffer.from(v).toString("base64") };
  if (typeof v.toUint8Array === "function") return { __fs: "bytes", b64: Buffer.from(v.toUint8Array()).toString("base64") };
  const out = {};
  for (const [k, val] of Object.entries(v)) out[k] = encodeValue(val);
  // A stored map that itself has an "__fs" key is wrapped so it can't be mistaken for a special value.
  return "__fs" in v ? { __fs: "map", v: out } : out;
}

/** JSON value → Firestore value. `types` = { Timestamp, GeoPoint, ref(path) } from the Admin SDK in use. */
function decodeValue(v, types) {
  if (Array.isArray(v)) return v.map(x => decodeValue(x, types));
  if (!v || typeof v !== "object") return v;
  switch (v.__fs) {
    case "timestamp": return new types.Timestamp(v.s, v.n);
    case "geo": return new types.GeoPoint(v.lat, v.lng);
    case "ref": return types.ref(v.path);
    case "bytes": return Buffer.from(v.b64, "base64");
    case "num": return Number(v.v);
    case "map": return decodeObject(v.v, types);
    default: return decodeObject(v, types);
  }
}
function decodeObject(obj, types) {
  const out = {};
  for (const [k, val] of Object.entries(obj)) out[k] = decodeValue(val, types);
  return out;
}

/** Reads one query page by page (ordered by document id) into NDJSON lines; stops at the deadline. */
async function dumpQuery(base, { idField, pageSize, deadline, now }) {
  const lines = [];
  let last = null;
  for (;;) {
    if (now() >= deadline) return { lines, complete: false };
    let q = base.orderBy(idField).limit(pageSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    for (const d of snap.docs) lines.push(JSON.stringify({ path: d.ref.path, data: encodeValue(d.data()) }));
    if (snap.docs.length < pageSize) return { lines, complete: true };
    last = snap.docs[snap.docs.length - 1];
  }
}

async function saveGzip(bucket, name, lines) {
  const body = zlib.gzipSync(Buffer.from(lines.length ? lines.join("\n") + "\n" : "", "utf8"));
  await bucket.file(name).save(body, { resumable: false, contentType: "application/gzip", metadata: { cacheControl: "no-store" } });
  return body.length;
}

/**
 * Copies every collection (except SKIP_COLLECTIONS) and SUBCOLLECTION_GROUPS into `folder`.
 * Returns the manifest: { complete, documents, bytes, collections: [{ id, file, documents, complete }], … }.
 * A collection that can't be read or written is listed with its `error` and makes the copy incomplete,
 * but the others are still copied. The manifest is written last, so a folder without one is unfinished.
 */
async function runJsonBackup({ db, bucket, folder, idField, deadline = Infinity, now = Date.now, pageSize = 400, at = new Date().toISOString() }) {
  const refs = await db.listCollections();
  const ids = refs.map(r => r.id).filter(id => !SKIP_COLLECTIONS.includes(id)).sort();
  const parts = [
    ...ids.map(id => ({ id, file: `${folder}/${id}.ndjson.gz`, query: () => db.collection(id) })),
    ...SUBCOLLECTION_GROUPS.map(name => ({ id: `group:${name}`, file: `${folder}/_group_${name}.ndjson.gz`, query: () => db.collectionGroup(name) })),
  ];
  const collections = [];
  const allLines = [];
  let documents = 0;
  let bytes = 0;
  for (const part of parts) {
    if (now() >= deadline) { collections.push({ id: part.id, file: part.file, documents: 0, complete: false, error: "Ran out of time" }); continue; }
    try {
      const { lines, complete } = await dumpQuery(part.query(), { idField, pageSize, deadline, now });
      bytes += await saveGzip(bucket, part.file, lines);
      documents += lines.length;
      allLines.push(...lines);
      collections.push({ id: part.id, file: part.file, documents: lines.length, complete, ...(complete ? {} : { error: "Ran out of time" }) });
    } catch (err) {
      collections.push({ id: part.id, file: part.file, documents: 0, complete: false, error: String(err?.message || err).slice(0, 200) });
    }
  }
  const complete = collections.every(c => c.complete);
  // The same documents as one JSON file. Stored with Content-Encoding: gzip, so a browser download unpacks it to
  // plain .json by itself. A failure here never loses the per-collection files above.
  let download = "";
  try {
    const head = JSON.stringify({ format: BACKUP_FORMAT, createdAt: at, complete, documentCount: documents });
    const body = `${head.slice(0, -1)},"documents":[\n${allLines.join(",\n")}\n]}\n`;
    await bucket.file(`${folder}/${DOWNLOAD_FILE}`).save(body, { resumable: false, gzip: true, contentType: "application/json", metadata: { cacheControl: "no-store" } });
    download = `${folder}/${DOWNLOAD_FILE}`;
  } catch (err) {
    console.error("Backup download file could not be written:", err?.message || err);
  }
  const manifest = {
    format: BACKUP_FORMAT, createdAt: at, folder, documents, bytes,
    complete, skipped: SKIP_COLLECTIONS, collections, download,
  };
  await bucket.file(`${folder}/manifest.json`).save(JSON.stringify(manifest, null, 2), { resumable: false, contentType: "application/json" });
  return manifest;
}

/** Plain-English reason for a refused managed export (gRPC code 7 / PERMISSION_DENIED). */
function exportRefusedForPermission(err) {
  return !!err && (err.code === 7 || /PERMISSION_DENIED|does not have permission/i.test(String(err.message)));
}

module.exports = { SKIP_COLLECTIONS, SUBCOLLECTION_GROUPS, BACKUP_FORMAT, DOWNLOAD_FILE, encodeValue, decodeValue, runJsonBackup, exportRefusedForPermission };
