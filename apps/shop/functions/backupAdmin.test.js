// Settings › Backups & export: the daily list and the download link (backupAdmin.js).
import { describe, expect, it } from "vitest";
const { listBackups, backupDownloadUrl } = require("./backupAdmin");

function fakeBucket(files, prefixes) {
  const signed = [];
  return {
    signed,
    async getFiles() { return [[], null, { prefixes }]; },
    file: name => ({
      async download() { if (!(name in files)) throw new Error("No such object"); return [Buffer.from(files[name])]; },
      async exists() { return [name in files]; },
      async getSignedUrl(opts) { signed.push({ name, ...opts }); return [`https://signed/${name}`]; },
    }),
  };
}

describe("listBackups", () => {
  it("lists every dated day newest first, with what each one holds", async () => {
    const bucket = fakeBucket({
      "backups/2026-10-11/json/manifest.json": JSON.stringify({ createdAt: "2026-10-11T07:17:00Z", documents: 812, complete: true, download: "backups/2026-10-11/json/backup.json" }),
      "backups/2026-10-11/export/export.overall_export_metadata": "x",
      "backups/2026-10-10/json/manifest.json": JSON.stringify({ createdAt: "2026-10-10T07:17:00Z", documents: 800, complete: false }),
    }, ["backups/2026-10-10/", "backups/2026-10-11/", "backups/2026-10-09/", "backups/notes/"]);
    const list = await listBackups({ bucket });
    expect(list.map(b => b.day)).toEqual(["2026-10-11", "2026-10-10", "2026-10-09"]);
    expect(list[0]).toMatchObject({ documents: 812, complete: true, downloadable: true, hasExport: true });
    expect(list[1]).toMatchObject({ documents: 800, complete: false, downloadable: false, hasExport: false });
    expect(list[2]).toMatchObject({ documents: null, complete: null, downloadable: false });
  });
});

describe("backupDownloadUrl", () => {
  const bucket = fakeBucket({ "backups/2026-10-11/json/backup.json": "{}" }, []);
  it("signs a short link that saves a dated .json file", async () => {
    const r = await backupDownloadUrl({ bucket, day: "2026-10-11", now: 0 });
    expect(r).toEqual({ status: 200, body: { url: "https://signed/backups/2026-10-11/json/backup.json" } });
    expect(bucket.signed[0]).toMatchObject({ action: "read", expires: 15 * 60 * 1000, responseDisposition: 'attachment; filename="lyricalmyrical-backup-2026-10-11.json"' });
  });
  it("refuses anything but a plain day, and days without a download file", async () => {
    expect((await backupDownloadUrl({ bucket, day: "../adminSecrets" })).status).toBe(400);
    expect((await backupDownloadUrl({ bucket, day: "2026-10-12" })).status).toBe(404);
  });
});
