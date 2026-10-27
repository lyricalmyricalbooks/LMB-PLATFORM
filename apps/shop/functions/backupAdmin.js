// Settings › General › Backups & export: the list of daily backups kept in the bucket, and a short-lived download
// link for one day's backup.json (admin only; createStripeCheckoutSession action "backups").
const { DOWNLOAD_FILE } = require("./backupJson");

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LINK_MINUTES = 15;

/** Every dated backups/<day>/ folder, newest first, with what its manifest says (null when it has none). */
async function listBackups({ bucket }) {
  const [, , api] = await bucket.getFiles({ prefix: "backups/", delimiter: "/", autoPaginate: false, maxResults: 1000 });
  const days = (api?.prefixes || [])
    .map(p => /^backups\/(\d{4}-\d{2}-\d{2})\/$/.exec(String(p))?.[1])
    .filter(Boolean)
    .sort()
    .reverse();
  return Promise.all(days.map(async day => {
    let manifest = null;
    try {
      const [buf] = await bucket.file(`backups/${day}/json/manifest.json`).download();
      manifest = JSON.parse(buf.toString("utf8"));
    } catch { /* no document copy that day (e.g. only a managed export, or the copy never finished) */ }
    const [hasExport] = await bucket.file(`backups/${day}/export/export.overall_export_metadata`).exists().catch(() => [false]);
    return {
      day,
      createdAt: manifest?.createdAt || "",
      documents: Number.isFinite(manifest?.documents) ? manifest.documents : null,
      complete: manifest ? manifest.complete === true : null,
      downloadable: !!manifest?.download,
      hasExport: !!hasExport,
    };
  }));
}

/** A 15-minute link that saves that day's backup as lyricalmyrical-backup-<day>.json. */
async function backupDownloadUrl({ bucket, day, now = Date.now() }) {
  if (!DAY_RE.test(String(day || ""))) return { status: 400, body: { error: "Pick a backup day." } };
  const file = bucket.file(`backups/${day}/json/${DOWNLOAD_FILE}`);
  const [exists] = await file.exists();
  if (!exists) return { status: 404, body: { error: "That day's backup has no download file. Backups made from now on include one." } };
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: now + LINK_MINUTES * 60 * 1000,
    responseDisposition: `attachment; filename="lyricalmyrical-backup-${day}.json"`,
    responseType: "application/json",
  });
  return { status: 200, body: { url } };
}

module.exports = { listBackups, backupDownloadUrl, LINK_MINUTES };
