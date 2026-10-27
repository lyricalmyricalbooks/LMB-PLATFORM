import { describe, expect, it } from "vitest";
import { describeBackup, describeBackupDay } from "./backupStatus";

const now = Date.parse("2026-10-10T12:00:00Z");
const at = "2026-10-10T07:17:00Z";

describe("describeBackup", () => {
  it("says nothing is recorded without a record (never a made-up OK)", () => {
    expect(describeBackup(null, now).label).toBe("Not recorded yet");
  });
  it("reports a failure with its error", () => {
    const v = describeBackup({ ok: false, lastAttemptAt: at, error: "disk full" }, now);
    expect(v.tone).toBe("danger");
    expect(v.detail).toContain("disk full");
  });
  it("explains a refused export in plain words and offers the fix", () => {
    const v = describeBackup({ ok: false, lastAttemptAt: at, error: "7 PERMISSION_DENIED: The caller does not have permission" }, now);
    expect(v.tone).toBe("danger");
    expect(v.detail).toContain("Cloud Datastore Import Export Admin");
    expect(v.exportNeedsRole).toBe(true);
  });
  it("flags an old success as overdue", () => {
    expect(describeBackup({ ok: true, lastAttemptAt: "2026-10-01T07:17:00Z", lastSuccessAt: "2026-10-01T07:17:00Z" }, now).tone).toBe("warning");
    expect(describeBackup({ ok: true, lastAttemptAt: at, lastSuccessAt: at }, now).tone).toBe("success");
  });
  it("a refused export with a good document copy is a good backup, with a note about the role", () => {
    const v = describeBackup({ ok: true, lastAttemptAt: at, lastSuccessAt: at, serviceAccount: "123-compute@developer.gserviceaccount.com",
      export: { ok: false, permission: true, error: "7 PERMISSION_DENIED" }, copy: { ok: true, documents: 1234, folder: "backups/2026-10-10/json" } }, now);
    expect(v.tone).toBe("success");
    expect(v.detail).toContain("documents copied to backups/2026-10-10/json");
    expect(v.exportNeedsRole).toBe(true);
    expect(v.serviceAccount).toContain("compute@");
    expect(v.notes[0]).toContain("still safe");
  });
  it("both parts working needs no fix", () => {
    const v = describeBackup({ ok: true, lastAttemptAt: at, lastSuccessAt: at, export: { ok: true }, copy: { ok: true, documents: 3, folder: "f" } }, now);
    expect(v).toMatchObject({ tone: "success", exportNeedsRole: false, notes: [] });
  });
  it("shows a backup in progress and a later-failed export", () => {
    const v = describeBackup({ ok: true, lastAttemptAt: at, lastSuccessAt: at, runningSince: "2026-10-10T11:58:00Z", previousExport: { done: true, error: "bucket denied" } }, now);
    expect(v.running).toBe(true);
    expect(v.notes.join(" ")).toContain("bucket denied");
  });
});

describe("describeBackupDay", () => {
  const row = { day: "2026-10-11", createdAt: "", documents: 812, complete: true, downloadable: true, hasExport: false };
  it("says whether each day's backup is complete", () => {
    expect(describeBackupDay(row)).toMatchObject({ tone: "success", label: "Complete" });
    expect(describeBackupDay({ ...row, hasExport: true }).detail).toContain("plus full Firestore export");
    expect(describeBackupDay({ ...row, complete: false }).label).toBe("Incomplete");
  });
  it("never shows an unfinished day as good", () => {
    expect(describeBackupDay({ ...row, documents: null, complete: null, downloadable: false })).toMatchObject({ tone: "danger", label: "Not finished" });
    expect(describeBackupDay({ ...row, documents: null, complete: null, downloadable: false, hasExport: true }).label).toBe("Export only");
  });
});
