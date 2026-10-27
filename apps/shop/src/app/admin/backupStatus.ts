// Settings › General › Backups & export: how to describe the nightly backup (pure, tested).
// The record is written by functions runFirestoreBackup (nightly, and Back up now) to admin-only systemStatus/backup.
// A run does two things: the managed Firestore export (needs an extra IAM role) and the Functions' own copy of every
// document (needs nothing extra). Either one counts as a good backup.

type ExportPart = { ok?: boolean; error?: string; permission?: boolean; operation?: string };
type CopyPart = { ok?: boolean; error?: string; documents?: number; folder?: string; failed?: string[] };
export type BackupRecord = {
  ok?: boolean; lastAttemptAt?: string; lastSuccessAt?: string; lastSuccessDay?: string; lastDay?: string; error?: string;
  trigger?: string; serviceAccount?: string; bucket?: string; runningSince?: string;
  export?: ExportPart; copy?: CopyPart; previousExport?: { done?: boolean; error?: string }; pruneError?: string;
} | null;
export type BackupView = {
  tone: "success" | "warning" | "danger" | "neutral"; label: string; detail: string;
  /** Extra lines under the status (export switched off, an earlier export failed, pruning failed). */
  notes: string[];
  /** The managed export was refused for a missing role: show how to grant it. */
  exportNeedsRole: boolean;
  serviceAccount: string;
  running: boolean;
};

const DAY = 24 * 60 * 60 * 1000;
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "never");
const ROLE_SENTENCE = "Google refused the full Firestore export because the Functions service account is missing the Cloud Datastore Import Export Admin role.";

function exportRefused(e?: ExportPart): boolean {
  return !!e && e.ok === false && (e.permission === true || /PERMISSION_DENIED|does not have permission/i.test(String(e.error || "")));
}

export function describeBackup(record: BackupRecord, now = Date.now()): BackupView {
  const base = { notes: [] as string[], exportNeedsRole: false, serviceAccount: record?.serviceAccount || "", running: false };
  if (record?.runningSince && now - Date.parse(record.runningSince) < 10 * 60 * 1000) base.running = true;
  if (!record || !record.lastAttemptAt) {
    return { ...base, tone: "neutral", label: base.running ? "Backing up…" : "Not recorded yet", detail: "The nightly backup (3:17 am Toronto) records its result here after it runs. You can also press Back up now." };
  }
  const needsRole = exportRefused(record.export) || (!record.export && /PERMISSION_DENIED/i.test(String(record.error || "")));
  base.exportNeedsRole = needsRole;
  if (record.previousExport?.done && record.previousExport.error) base.notes.push(`The previous full export was accepted but failed later: ${record.previousExport.error}`);
  if (record.pruneError) base.notes.push(`Old backups (over 30 days) could not be deleted: ${record.pruneError}`);
  const last = when(record.lastSuccessAt);

  if (record.ok === false) {
    const copyFailed = record.copy && record.copy.ok === false ? ` The document copy also failed: ${record.copy.error || "unknown error"}.` : "";
    const reason = needsRole ? `${ROLE_SENTENCE}${copyFailed}` : (record.error || "Unknown error");
    return { ...base, tone: "danger", label: "Last backup failed", detail: `${reason} Last good backup: ${last}.` };
  }
  const age = now - Date.parse(record.lastSuccessAt || record.lastAttemptAt);
  if (age > 2 * DAY) return { ...base, tone: "warning", label: "Backup is overdue", detail: `Last good backup: ${last}. Press Back up now, or check the nightlyFirestoreBackup function's logs.` };

  const copy = record.copy;
  const copied = copy?.ok ? `${(copy.documents ?? 0).toLocaleString()} documents copied to ${copy.folder || "backups/"}` : "";
  if (record.export?.ok && copy?.ok) {
    return { ...base, tone: "success", label: "Backed up", detail: `Last backup ${last}: full Firestore export started, and ${copied}.` };
  }
  if (copy?.ok) {
    if (needsRole) base.notes.unshift(`${ROLE_SENTENCE} Your data is still safe: the document copy covers every collection. Granting the role adds the faster full export as a second copy.`);
    else if (record.export?.error) base.notes.unshift(`The full Firestore export didn't start: ${record.export.error}`);
    return { ...base, tone: "success", label: "Backed up", detail: `Last backup ${last}: ${copied}.` };
  }
  if (record.export?.ok) {
    if (copy?.error) base.notes.unshift(`The document copy was incomplete: ${copy.error}`);
    return { ...base, tone: "success", label: "Backed up", detail: `Last backup ${last}: full Firestore export started (folder backups/${record.lastSuccessDay || ""}/export).` };
  }
  // Records written before the document copy existed.
  return { ...base, tone: "success", label: "Backed up", detail: `Last backup started ${last} (Firestore export to the storage bucket, folder backups/${record.lastSuccessDay || ""}).` };
}

/** One day in Settings › Backups & export › Daily backups (functions/backupAdmin.js listBackups). */
export type BackupDay = { day: string; createdAt: string; documents: number | null; complete: boolean | null; downloadable: boolean; hasExport: boolean };

/** How one day's backup reads in the list. */
export function describeBackupDay(row: BackupDay): { tone: BackupView["tone"]; label: string; detail: string } {
  const parts: string[] = [];
  if (row.documents !== null) parts.push(`${row.documents.toLocaleString()} documents`);
  if (row.hasExport) parts.push("plus full Firestore export");
  const detail = parts.join(" · ");
  if (row.complete === true) return { tone: "success", label: "Complete", detail };
  if (row.complete === false) return { tone: "warning", label: "Incomplete", detail: detail || "Some collections weren't copied" };
  if (row.hasExport) return { tone: "success", label: "Export only", detail: "Full Firestore export (restore with gcloud); no download file" };
  return { tone: "danger", label: "Not finished", detail: "This backup didn't finish" };
}
