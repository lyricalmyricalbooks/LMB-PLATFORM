// Busy times from Outlook, Apple and other calendars (Bookings plan 4, step 5.7). The owner pastes a calendar's private
// address (Outlook's "Publish calendar" ICS link, an Apple iCloud shared calendar link); the server reads it every 15
// minutes and closes those times on the booking page, for the whole shop or for one person. Only start and end are read,
// never what an event is. One copy for the admin (the address check) and the server (the check and the reading).
import { addDays, weekdayOf, zonedTime } from "./bookingTimes";

/** Calendars the server may read, by host. Anything else is refused: the server never fetches an address it can't place. */
const HOSTS: ReadonlyArray<{ kind: CalendarKind; test: RegExp }> = [
  { kind: "outlook", test: /^outlook\.(office365|office|live)\.com$/ },
  { kind: "apple", test: /^([a-z0-9-]+\.)*icloud\.com$/ },
  { kind: "google", test: /^calendar\.google\.com$/ },
  { kind: "other", test: /^(calendar\.proton\.me|([a-z0-9-]+\.)*fastmail\.com|(export\.)?calendar\.yahoo\.com|([a-z0-9-]+\.)*zoho\.(com|eu))$/ },
];
export type CalendarKind = "outlook" | "apple" | "google" | "other";
export const CALENDAR_KIND_NAMES: Record<CalendarKind, string> = { outlook: "Outlook", apple: "Apple Calendar", google: "Google Calendar", other: "Calendar" };
/** Calendars one shop may add. */
export const MAX_FEEDS = 10;
/** How far ahead busy times are read. */
export const FEED_DAYS = 60;
/** The most busy times kept from one calendar. */
export const MAX_FEED_SPANS = 2000;

/** The address cleaned (webcal:// read as https://) and which calendar it is, or a problem in plain words. */
export function cleanFeedUrl(value: unknown): { url: string; kind: CalendarKind } | { problem: string } {
  const raw = String(value ?? "").trim().replace(/^webcals?:\/\//i, "https://");
  if (!raw) return { problem: "Paste the calendar's address." };
  if (raw.length > 2000) return { problem: "That address is too long to be a calendar link." };
  let u: URL;
  try { u = new URL(raw); } catch { return { problem: "That isn't a web address. Copy the whole calendar link." }; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return { problem: "Use the calendar's https:// or webcal:// link." };
  const host = u.hostname.toLowerCase();
  const kind = HOSTS.find((h) => h.test.test(host))?.kind;
  if (!kind) return { problem: "Use a link from Outlook, Apple iCloud, Google, Proton, Fastmail, Yahoo or Zoho calendars." };
  u.hash = "";
  return { url: u.toString(), kind };
}

/** Whether a host is one the server may read (also checked on every redirect). */
export function feedHostAllowed(host: string): boolean {
  return HOSTS.some((h) => h.test.test(String(host).toLowerCase()));
}

// Outlook writes Windows zone names; the common ones, to the zone they mean.
const WINDOWS_ZONES: Record<string, string> = {
  "Eastern Standard Time": "America/Toronto", "US Eastern Standard Time": "America/Indiana/Indianapolis",
  "Central Standard Time": "America/Chicago", "Canada Central Standard Time": "America/Regina",
  "Mountain Standard Time": "America/Edmonton", "US Mountain Standard Time": "America/Phoenix",
  "Pacific Standard Time": "America/Vancouver", "Atlantic Standard Time": "America/Halifax",
  "Newfoundland Standard Time": "America/St_Johns", "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu", "GMT Standard Time": "Europe/London", "Greenwich Standard Time": "Atlantic/Reykjavik",
  "W. Europe Standard Time": "Europe/Berlin", "Romance Standard Time": "Europe/Paris", "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw", "E. Europe Standard Time": "Europe/Chisinau", "FLE Standard Time": "Europe/Kiev",
  "AUS Eastern Standard Time": "Australia/Sydney", "Tokyo Standard Time": "Asia/Tokyo", "India Standard Time": "Asia/Kolkata",
  "China Standard Time": "Asia/Shanghai", "UTC": "UTC", "Coordinated Universal Time": "UTC",
};

function zoneFor(tzid: string | undefined, fallback: string): string {
  if (!tzid) return fallback;
  const name = tzid.replace(/^"|"$/g, "").replace(/^\/+/, "").trim();
  if (WINDOWS_ZONES[name]) return WINDOWS_ZONES[name];
  // Some calendars prefix the zone ("/mozilla.org/20050126_1/America/Toronto"): keep the last Area/City.
  const tail = name.match(/([A-Za-z_]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?)$/)?.[1] || name;
  try { new Intl.DateTimeFormat("en", { timeZone: tail }); return tail; } catch { return fallback; }
}

type Prop = { value: string; params: Record<string, string> };
type When = { day: string; time: string; zone: string; utc: boolean; allDay: boolean };

/** Lines of an ICS file with folded lines joined, as `NAME;PARAM=x:value`. */
function unfold(text: string): string[] {
  return String(text || "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseLine(line: string): { name: string; prop: Prop } | null {
  // The value starts after the first colon outside quotes.
  let quoted = false;
  let at = -1;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) { at = i; break; }
  }
  if (at < 1) return null;
  const [name, ...rest] = line.slice(0, at).split(";");
  const params: Record<string, string> = {};
  for (const p of rest) { const eq = p.indexOf("="); if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1); }
  return { name: name.toUpperCase(), prop: { value: line.slice(at + 1).trim(), params } };
}

function parseWhen(prop: Prop | undefined, fallback: string): When | null {
  const m = prop?.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const allDay = !m[4];
  return { day: `${m[1]}-${m[2]}-${m[3]}`, time: allDay ? "00:00" : `${m[4]}:${m[5]}`, zone: m[7] ? "UTC" : zoneFor(prop!.params.TZID, fallback), utc: !!m[7], allDay };
}

const msOf = (w: When, day = w.day) => zonedTime(day, w.time, w.zone);

function durationMs(value: string | undefined): number | null {
  const m = String(value || "").match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const n = (i: number) => Number(m[i] || 0);
  const ms = (((n(2) * 7 + n(3)) * 24 + n(4)) * 60 + n(5)) * 60_000 + n(6) * 1000;
  return m[1] === "-" ? null : ms;
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** The nth (1…5, or -1 last) weekday of a month as a day, or "" when the month hasn't one. */
function nthWeekday(year: number, month: number, weekday: number, nth: number): string {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const all: string[] = [];
  for (let d = 1; d <= days; d += 1) {
    const day = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (weekdayOf(day) === weekday) all.push(day);
  }
  return (nth < 0 ? all[all.length + nth] : all[nth - 1]) || "";
}

/** The days a repeating event happens on, from its first day, up to `lastDay` (at most 1,000 times). */
function repeatDays(first: string, rule: string, lastDay: string, untilMs: (day: string) => boolean): string[] {
  const r: Record<string, string> = {};
  for (const part of rule.split(";")) { const [k, v] = part.split("="); if (k && v) r[k.toUpperCase()] = v.toUpperCase(); }
  const freq = r.FREQ;
  const every = Math.max(1, Math.min(365, Number(r.INTERVAL) || 1));
  const count = r.COUNT ? Math.max(1, Math.min(1000, Number(r.COUNT) || 1)) : 1000;
  const byDay = (r.BYDAY || "").split(",").filter(Boolean).map((t) => ({ nth: Number(t.slice(0, -2)) || 0, weekday: WEEKDAYS.indexOf(t.slice(-2)) })).filter((x) => x.weekday >= 0);
  const byMonthDay = (r.BYMONTHDAY || "").split(",").map(Number).filter((n) => n >= 1 && n <= 31);
  const out: string[] = [];
  const push = (day: string) => {
    if (day < first || day > lastDay || out.length >= count || !untilMs(day)) return false;
    out.push(day);
    return true;
  };
  const [y0, m0] = [Number(first.slice(0, 4)), Number(first.slice(5, 7))];
  for (let i = 0, guard = 0; out.length < count && guard < 4000; i += 1, guard += 1) {
    let candidates: string[] = [];
    if (freq === "DAILY") candidates = [addDays(first, i * every)];
    else if (freq === "WEEKLY") {
      const weekStart = addDays(first, i * every * 7 - weekdayOf(first));
      const want = byDay.length ? byDay.map((b) => b.weekday) : [weekdayOf(first)];
      candidates = [...new Set(want)].sort((a, b) => a - b).map((w) => addDays(weekStart, w));
    } else if (freq === "MONTHLY") {
      const mIndex = m0 - 1 + i * every;
      const year = y0 + Math.floor(mIndex / 12);
      const month = (mIndex % 12) + 1;
      const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const mm = String(month).padStart(2, "0");
      if (byDay.length) candidates = byDay.map((b) => nthWeekday(year, month, b.weekday, b.nth || 1)).filter(Boolean);
      else candidates = (byMonthDay.length ? byMonthDay : [Number(first.slice(8, 10))]).filter((d) => d <= dim).map((d) => `${year}-${mm}-${String(d).padStart(2, "0")}`);
    } else if (freq === "YEARLY") {
      const day = `${y0 + i * every}${first.slice(4)}`;
      if (!Number.isNaN(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day) candidates = [day];
    } else return [first];
    candidates.sort();
    if (candidates.length && candidates[0] > lastDay) break;
    for (const d of candidates) push(d);
    // Past the end date: stop.
    if (candidates.length && !untilMs(candidates[candidates.length - 1]) && candidates[candidates.length - 1] >= first) break;
  }
  return out;
}

export type BusySpan = { s: number; e: number };

/**
 * The busy times in an ICS calendar between `fromMs` and `toMs`: repeating events opened out, free and cancelled
 * events left out, a moved repeat taken from its own event. Times are read in each event's zone (an event with none
 * is in `zone`, the shop's). Overlaps are joined; at most MAX_FEED_SPANS.
 */
export function busyFromIcs(text: string, fromMs: number, toMs: number, zone: string): BusySpan[] {
  const events: Array<Record<string, Prop[]>> = [];
  let cur: Record<string, Prop[]> | null = null;
  let depth = 0;
  for (const line of unfold(text)) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === "BEGIN") { if (p.prop.value.toUpperCase() === "VEVENT") { cur = {}; depth = 0; } else if (cur) depth += 1; continue; }
    if (p.name === "END") { if (p.prop.value.toUpperCase() === "VEVENT" && cur) { events.push(cur); cur = null; } else if (cur) depth -= 1; continue; }
    if (cur && depth === 0) (cur[p.name] ||= []).push(p.prop);
  }
  const first = (e: Record<string, Prop[]>, k: string) => e[k]?.[0];
  // A moved or cancelled repeat comes as its own event with RECURRENCE-ID: leave that time out of the series.
  const moved = new Map<string, Set<number>>();
  for (const e of events) {
    const rid = parseWhen(first(e, "RECURRENCE-ID"), zone);
    if (!rid) continue;
    const uid = first(e, "UID")?.value || "";
    if (!moved.has(uid)) moved.set(uid, new Set());
    moved.get(uid)!.add(msOf(rid));
  }
  const spans: BusySpan[] = [];
  const lastDay = addDays(new Date(toMs).toISOString().slice(0, 10), 2);
  for (const e of events) {
    if ((first(e, "STATUS")?.value || "").toUpperCase() === "CANCELLED") continue;
    if ((first(e, "TRANSP")?.value || "").toUpperCase() === "TRANSPARENT") continue;
    const busyStatus = (first(e, "X-MICROSOFT-CDO-BUSYSTATUS")?.value || "").toUpperCase();
    if (busyStatus === "FREE" || busyStatus === "WORKINGELSEWHERE") continue;
    const start = parseWhen(first(e, "DTSTART"), zone);
    if (!start) continue;
    // All-day events sit on the shop's own days.
    if (start.allDay) start.zone = zone;
    const end = parseWhen(first(e, "DTEND"), zone);
    if (end?.allDay) end.zone = zone;
    const s0 = msOf(start);
    const length = end ? msOf(end) - s0 : durationMs(first(e, "DURATION")?.value) ?? (start.allDay ? 24 * 3_600_000 : 0);
    if (!(length > 0) || length > 31 * 24 * 3_600_000) continue;
    const rule = first(e, "RRULE")?.value;
    const isOverride = !!first(e, "RECURRENCE-ID");
    let days = [start.day];
    if (rule && !isOverride) {
      const until = rule.match(/UNTIL=(\d{8}(?:T\d{6}Z?)?)/i)?.[1];
      const untilWhen = until ? parseWhen({ value: until.toUpperCase(), params: {} }, start.zone) : null;
      const untilAt = untilWhen ? (untilWhen.allDay ? msOf({ ...untilWhen, zone: start.zone }, addDays(untilWhen.day, 1)) - 1 : msOf(untilWhen)) : Infinity;
      days = repeatDays(start.day, rule, lastDay, (day) => msOf(start, day) <= untilAt);
    }
    const skip = new Set<number>(moved.get(first(e, "UID")?.value || "") && !isOverride ? moved.get(first(e, "UID")?.value || "") : []);
    for (const ex of e.EXDATE || []) {
      for (const v of ex.value.split(",")) { const w = parseWhen({ value: v.trim(), params: ex.params }, zone); if (w) skip.add(w.allDay ? msOf({ ...start }, w.day) : msOf(w)); }
    }
    for (const day of days) {
      const s = msOf(start, day);
      if (skip.has(s)) continue;
      const e2 = start.allDay && end ? msOf(end, addDays(day, Math.round(length / 86_400_000))) : s + length;
      if (e2 <= fromMs || s >= toMs) continue;
      spans.push({ s: Math.max(fromMs, s), e: Math.min(toMs, e2) });
    }
  }
  spans.sort((a, b) => a.s - b.s || a.e - b.e);
  const joined: BusySpan[] = [];
  for (const x of spans) {
    const last = joined[joined.length - 1];
    if (last && x.s <= last.e) last.e = Math.max(last.e, x.e);
    else joined.push({ ...x });
  }
  return joined.slice(0, MAX_FEED_SPANS);
}

/** Whether the text looks like a calendar file at all (a page asking to sign in doesn't). */
export function looksLikeCalendar(text: string): boolean {
  return /BEGIN:VCALENDAR/i.test(String(text || "").slice(0, 2000));
}
