// Scheduled publishing & campaigns (Studio 3.5), the Studio side. Entries live in admin-only `themeSchedule/{id}`;
// functions/themeSchedule.js publishes them from the 15-minute sweep. Times are entered as Toronto wall-clock time
// (the shop's time zone) and stored as UTC ISO strings. Pure: no React, no Firestore.

export type ScheduleKind = "publish" | "campaign";
export type ScheduleStatus = "scheduled" | "live" | "done" | "cancelled" | "skipped";
export type ScheduleEntry = {
  id: string; kind: ScheduleKind; name: string; status: ScheduleStatus;
  startAt: string; endAt?: string | null; createdAt?: string; startedAt?: string; endedAt?: string; note?: string;
  design?: any;
};

// The shop clock lives in features/site/shopTime.ts so the storefront (section show-from/until) uses the same rules.
import { isNonexistentTorontoTime, isoToTorontoLocal, SHOP_TZ, torontoLocalToIso } from "../../features/site/shopTime";
export { isNonexistentTorontoTime, isoToTorontoLocal, SHOP_TZ, torontoLocalToIso };

/** "Sat, Oct 10, 9:00 a.m." in Toronto time. */
export function formatToronto(iso?: string | null): string {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t));
}

const MAX_CAMPAIGN_DAYS = 120;

/** Problems with a new entry, in the owner's words (empty = fine). */
export function scheduleProblems(entry: { kind: ScheduleKind; startAt: string | null; endAt?: string | null; startLocal?: string; endLocal?: string }, existing: ScheduleEntry[], now = Date.now()): string[] {
  const out: string[] = [];
  // Toronto skips an hour when the clocks go forward in March. Such a time is refused, not quietly moved.
  const skipped = (label: string, local?: string) => (local && isNonexistentTorontoTime(local)
    ? [`${label} time ${local.replace("T", " ")} doesn't exist in Toronto: the clocks jump from 2:00 a.m. to 3:00 a.m. that day. Choose 3:00 a.m. or later, or before 2:00 a.m.`] : []);
  const gap = [...skipped("The start", entry.startLocal), ...(entry.kind === "campaign" ? skipped("The end", entry.endLocal) : [])];
  if (gap.length) return gap;
  const start = Date.parse(String(entry.startAt || ""));
  if (!Number.isFinite(start)) return ["Choose when it should start."];
  if (start < now - 60_000) out.push("The start time has already passed. Choose a time in the future.");
  if (entry.kind === "campaign") {
    const end = Date.parse(String(entry.endAt || ""));
    if (!Number.isFinite(end)) out.push("Choose when the campaign should end.");
    else if (end <= start) out.push("The end must be after the start.");
    else if (end - start > MAX_CAMPAIGN_DAYS * 86_400_000) out.push(`A campaign can run for up to ${MAX_CAMPAIGN_DAYS} days.`);
    else {
      // Overlapping campaigns would switch back to each other's look; one at a time keeps the ending predictable.
      const clash = existing.find(e => e.kind === "campaign" && (e.status === "scheduled" || e.status === "live")
        && Date.parse(e.startAt) < end && Date.parse(String(e.endAt)) > start);
      if (clash) out.push(`It overlaps “${clash.name}”. Campaigns run one at a time.`);
    }
  }
  return out;
}

export type SchedulerHealth = { state: "ok" | "stale" | "never"; text: string };
/** Whether the server scheduler (Cloud Functions) is running: it stamps lastRunAt every 15 minutes. */
export function schedulerHealth(lastRunAt: string | null | undefined, now = Date.now()): SchedulerHealth {
  const t = Date.parse(String(lastRunAt || ""));
  if (!Number.isFinite(t)) return { state: "never", text: "The shop's scheduler hasn't checked in yet, so scheduled changes won't go live on their own until it does. If this stays after a day, ask whoever looks after the website's server side to check it." };
  if (now - t > 45 * 60_000) return { state: "stale", text: `The scheduler last checked ${formatToronto(lastRunAt)}. It normally checks every 15 minutes, so scheduled changes may be late. If this stays, ask whoever looks after the website's server side to check it.` };
  return { state: "ok", text: `The scheduler checks every 15 minutes (last check ${formatToronto(lastRunAt)}). Changes go live within 15 minutes of their time.` };
}

export const STATUS_WORDS: Record<ScheduleStatus, string> = {
  scheduled: "Scheduled", live: "Running now", done: "Done", cancelled: "Cancelled", skipped: "Skipped",
};
export const NOTE_WORDS: Record<string, string> = {
  "kept-later-publish": "You published something else while it ran, so that was kept instead of switching back.",
  "ended-before-start": "Its end time passed before it could start.",
  "no-design": "It had no design to publish.",
};
