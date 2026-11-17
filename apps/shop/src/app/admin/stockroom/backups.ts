// Stockroom › Backups: the one place for backups, downloads and exports in the combined admin. Pure words for its rows.
import type { BackupRecord } from "../backupStatus";
import type { LocalMeta } from "../localBackup";

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const DAY = 24 * 60 * 60 * 1000;
const dayKey = (t: number) => new Date(t).toDateString();
const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** "Today, 10:42", "Last night, 03:17", "Yesterday, 14:05" or "12 Nov, 03:17" (this browser's time zone). */
export function whenWords(iso: string | null | undefined, now = Date.now()): string {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const hour = new Date(t).getHours();
  if (dayKey(t) === dayKey(now)) return `${hour < 6 ? "Last night" : "Today"}, ${clock(t)}`;
  if (dayKey(t) === dayKey(now - DAY)) return `${hour >= 20 ? "Last night" : "Yesterday"}, ${clock(t)}`;
  return `${new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${clock(t)}`;
}

/** The words for how often the downloadable copy runs: weekly in the shared system, with Colophon's copy every night. */
export function backupCadence(weekly: boolean) {
  return weekly
    ? { name: "Every week", sub: "Every week · kept 30 days · Colophon also backs up every night", card: "Weekly at 3:17 am. Kept 30 days. Colophon also backs up your shop every night.", drawer: "Every week. Kept 30 days. Colophon also backs up your shop every night." }
    : { name: "Every night", sub: "Every night · kept 30 days", card: "Nightly at 3:17 am. Kept 30 days.", drawer: "Every night. Kept 30 days." };
}

/** The backup's row: when it last worked, and what it holds. */
export function nightlyRow(record: BackupRecord | null | undefined, now = Date.now(), weekly = false) {
  const last = whenWords(record?.lastSuccessAt, now);
  const words = backupCadence(weekly);
  return { name: last || words.name, sub: last ? words.sub : "The first one runs tonight" };
}

/** The folder row: where the last copy went on this computer, or what it does. */
export function folderRow(meta: Pick<LocalMeta, "lastAt" | "folder">, supported: boolean, now = Date.now()) {
  if (!supported) return { sub: "Works in Chrome and Edge", tone: "neutral" as const, label: "Not here" };
  if (!meta.lastAt) return { sub: "A second copy on this computer", tone: "neutral" as const, label: "Off" };
  return { sub: `${meta.folder ? `${meta.folder} · ` : ""}last copy ${lower(whenWords(meta.lastAt, now))}`, tone: "success" as const, label: "On" };
}
