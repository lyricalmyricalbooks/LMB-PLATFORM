// The Overview's date ranges: rolling windows, calendar periods and custom dates, each with what it is compared
// against (the equally long block before, or the same days a year earlier). Pure; days are Toronto calendar days
// (lib/shopDay.ts), the same keys orders are counted on. Traffic docs are keyed by UTC day, so `trafficShift`
// moves a range that ends today onto the UTC "today" exactly as the rolling windows always did.
import { addDays, shopDayKey } from "../../lib/shopDay";

const DAY = 86_400_000;
export const MAX_RANGE_DAYS = 731;

export type Preset = "today" | "7d" | "30d" | "90d" | "365d" | "mtd" | "lastMonth" | "ytd" | "custom";
export type CompareMode = "previous" | "lastYear";

export interface Range {
  preset: Preset; compare: CompareMode;
  startKey: string; endKey: string; prevStartKey: string; prevEndKey: string;
  /** Days in the range (inclusive). */
  days: number;
  /** "the last 30 days", "September 2026" … */
  phrase: string;
  /** What it is compared with: "the 30 days before", "the same days last year" … */
  before: string;
}

export const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: "today", label: "Today" }, { id: "7d", label: "7 days" }, { id: "30d", label: "30 days" }, { id: "90d", label: "90 days" },
  { id: "mtd", label: "This month" }, { id: "lastMonth", label: "Last month" }, { id: "ytd", label: "This year" },
  { id: "365d", label: "12 months" }, { id: "custom", label: "Custom" },
];

const ROLLING: Partial<Record<Preset, number>> = { today: 1, "7d": 7, "30d": 30, "90d": 90, "365d": 365 };
export const isDayKey = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/** The same calendar day a year earlier (29 Feb → 28 Feb). */
export function yearEarlier(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

const dayLabel = (key: string, withYear = true) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString("en-CA", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
const monthLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });

/** "14 Sep – 13 Oct 2026" (or one day) for showing a window in words. */
export function rangeWords(startKey: string, endKey: string): string {
  if (startKey === endKey) return dayLabel(startKey);
  return `${dayLabel(startKey, startKey.slice(0, 4) !== endKey.slice(0, 4))} – ${dayLabel(endKey)}`;
}

/** The window a preset (or custom dates) covers today, with its comparison window and plain-English names. */
export function resolveRange(preset: Preset, opts: { now?: number; custom?: { from?: string; to?: string }; compare?: CompareMode } = {}): Range {
  const now = opts.now ?? Date.now();
  const compare: CompareMode = opts.compare === "lastYear" ? "lastYear" : "previous";
  const today = shopDayKey(now);
  let startKey = today, endKey = today, phrase = "today", kind: Preset = preset;
  const rolling = ROLLING[preset];
  if (rolling) {
    startKey = addDays(today, -(rolling - 1));
    phrase = rolling === 1 ? "today" : rolling === 365 ? "the last 12 months" : `the last ${rolling} days`;
  } else if (preset === "mtd") {
    startKey = `${today.slice(0, 7)}-01`; phrase = "this month so far";
  } else if (preset === "lastMonth") {
    endKey = addDays(`${today.slice(0, 7)}-01`, -1); startKey = `${endKey.slice(0, 7)}-01`; phrase = monthLabel(startKey);
  } else if (preset === "ytd") {
    startKey = `${today.slice(0, 4)}-01-01`; phrase = "this year so far";
  } else {
    const from = opts.custom?.from, to = opts.custom?.to;
    if (isDayKey(from) && isDayKey(to) && from <= to) {
      endKey = to > today ? today : to;
      startKey = from > endKey ? endKey : from;
      if (daysBetween(startKey, endKey) + 1 > MAX_RANGE_DAYS) startKey = addDays(endKey, -(MAX_RANGE_DAYS - 1));
      phrase = startKey === endKey ? dayLabel(startKey) : `${dayLabel(startKey, startKey.slice(0, 4) !== endKey.slice(0, 4))} – ${dayLabel(endKey)}`;
    } else {
      kind = "30d"; startKey = addDays(today, -29); phrase = "the last 30 days";
    }
  }
  const days = daysBetween(startKey, endKey) + 1;
  let prevStartKey: string, prevEndKey: string, before: string;
  if (compare === "lastYear") {
    prevStartKey = yearEarlier(startKey); prevEndKey = yearEarlier(endKey);
    before = days === 1 ? "the same day last year" : "the same days last year";
  } else {
    prevEndKey = addDays(startKey, -1); prevStartKey = addDays(prevEndKey, -(days - 1));
    before = days === 1 ? (kind === "today" ? "yesterday" : "the day before")
      : kind === "lastMonth" ? "the days before it"
      : kind === "365d" ? "the 12 months before"
      : `the ${days} days before`;
  }
  return { preset: kind, compare, startKey, endKey, prevStartKey, prevEndKey, days, phrase, before };
}

/** Days to add to Toronto keys to reach the UTC-keyed traffic docs: 1 in Toronto's evening for a range ending today. */
export function trafficShift(range: Range, now = Date.now()): number {
  const shop = shopDayKey(now);
  if (range.endKey !== shop) return 0;
  return daysBetween(shop, new Date(now).toISOString().slice(0, 10));
}

/**
 * The UTC days of traffic docs a range and its comparison window need (a day of slack each side), read with
 * adminApi.getDailyAnalyticsBetween — at most 2 × MAX_RANGE_DAYS + 3 docs, however long ago the range is.
 */
export function trafficWindow(range: Range, now = Date.now()): { fromKey: string; toKey: string } {
  const shift = trafficShift(range, now);
  return { fromKey: addDays(range.prevStartKey, shift - 1), toKey: addDays(range.endKey, shift + 1) };
}

export type Grain = "day" | "week" | "month";
/** A readable default: days up to ~6 weeks, then weeks up to ~6 months, then months. */
/**
 * The grouping "Auto" picks for a range. With `activeDays` (days that had any sales), a 14–45 day range where fewer than
 * half the days sold anything groups by week, so a quiet month isn't a row of spikes on a flat line.
 */
export const autoGrain = (days: number, activeDays?: number): Grain =>
  days <= 45 ? (activeDays !== undefined && days >= 14 && activeDays < days / 2 ? "week" : "day") : days <= 186 ? "week" : "month";

/** The bucket a day falls in: itself, its week's Monday, or its month's first day. */
export function bucketKey(key: string, grain: Grain): string {
  if (grain === "day") return key;
  if (grain === "month") return `${key.slice(0, 7)}-01`;
  const dow = new Date(`${key}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

export function bucketLabel(key: string, grain: Grain): string {
  if (grain === "month") return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", year: "2-digit", timeZone: "UTC" });
  const d = dayLabel(key, false);
  return grain === "week" ? `w/c ${d}` : d;
}
