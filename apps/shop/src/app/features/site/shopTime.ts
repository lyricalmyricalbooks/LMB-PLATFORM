// The shop's clock. Every time the owner types without a zone (Studio's datetime-local fields: schedules,
// section "Show from / until") means Toronto wall-clock time, whatever the viewer's or the build machine's
// zone is. Pure: no React, no Firestore. Used by the storefront and by Studio (admin/studio/themeSchedule.ts).

export const SHOP_TZ = "America/Toronto";

/** Toronto's offset from UTC (minutes) at a given instant. */
export function offsetMinutes(utcMs: number): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs)).map(p => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/** UTC ms → "2026-10-10T09:00" Toronto wall-clock time. */
function wallOf(utcMs: number): string {
  return new Date(utcMs + offsetMinutes(utcMs) * 60000).toISOString().slice(0, 16);
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * "2026-10-10T09:00" in Toronto → UTC ms. NaN for an invalid value. A time that does not exist (the hour the
 * clocks jump over in March) is read as the same moment after the jump, never an hour before the time typed.
 */
function torontoWallToMs(local: string): number {
  const m = LOCAL.exec(String(local || ""));
  if (!m) return NaN;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Two passes settle the offset across daylight-saving changes.
  const first = wall - offsetMinutes(wall) * 60000;
  const second = wall - offsetMinutes(first) * 60000;
  if (wallOf(second) === local) return second;
  return first;
}

/** "2026-10-10T09:00" in Toronto → UTC ISO. Null for an invalid value. */
export function torontoLocalToIso(local: string): string | null {
  const ms = torontoWallToMs(local);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** True for a well-formed Toronto time that never happens (2:30 a.m. on the March clock change). */
export function isNonexistentTorontoTime(local: string): boolean {
  const ms = torontoWallToMs(local);
  return Number.isFinite(ms) && wallOf(ms) !== local;
}

/** UTC ISO → "2026-10-10T09:00" Toronto wall-clock time (for datetime-local inputs). */
export function isoToTorontoLocal(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? wallOf(t) : "";
}

/**
 * The instant a stored time means. Zone-less values ("2026-10-31T23:59" from a datetime-local input, or a bare
 * "2026-10-31") are Toronto time; values that carry their own zone (Z or ±hh:mm) are taken as written.
 * NaN when it isn't a date at all.
 */
export function shopInstant(value: unknown): number {
  const text = String(value ?? "").trim();
  if (!text) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return torontoWallToMs(`${text}T00:00`);
  const local = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(text);
  if (local) return torontoWallToMs(local[1]);
  return Date.parse(text);
}
