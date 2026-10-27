// "Order now — ships by …" on book pages (Shopify themes' dispatch / delivery-date line), Studio › Style › Book
// page · photos & layout › showPdpShipBy (off by default). The owner promises a dispatch time: `days` working days
// (Monday–Friday in Toronto, minus the closed days they list), counted from today when the order comes in before
// the cut-off hour, else from the next working day. Display only: it never changes an order. Pure.
import { SHOP_TZ } from "./shopTime";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ShipByRules = { days: number; cutoffHour: number; closed: string[] };

/** The owner's list of days the shop doesn't ship ("2026-12-25, 2026-12-26"), cleaned to YYYY-MM-DD dates. */
export function closedDays(value: unknown): string[] {
  return String(value ?? "").split(/[\s,;]+/).map((s) => s.trim()).filter((s) => DATE_ONLY.test(s));
}

/** Toronto calendar date (YYYY-MM-DD) and hour/minute of an instant. */
export function torontoClock(ms: number): { date: string; hour: number; minute: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function workingDay(date: string, closed: string[]): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !closed.includes(date);
}

export type ShipBy = { date: string; minutesToCutoff: number | null };

/**
 * The dispatch date for an order placed at `nowMs`, and how many minutes are left before today's cut-off
 * (null when today's cut-off has passed or today isn't a working day). Null when the rules make no sense.
 */
export function shipBy(nowMs: number, rules: ShipByRules): ShipBy | null {
  const days = Math.floor(Number(rules.days));
  const cutoff = Math.floor(Number(rules.cutoffHour));
  if (!Number.isFinite(nowMs) || !(days >= 0 && days <= 60) || !(cutoff >= 0 && cutoff <= 24)) return null;
  const closed = rules.closed || [];
  const clock = torontoClock(nowMs);
  const beforeCutoff = workingDay(clock.date, closed) && clock.hour < cutoff;
  // The first working day the order counts from.
  let day = beforeCutoff ? clock.date : addDays(clock.date, 1);
  let guard = 0;
  while (!workingDay(day, closed) && guard++ < 366) day = addDays(day, 1);
  for (let left = days; left > 0 && guard < 366; guard++) {
    day = addDays(day, 1);
    if (workingDay(day, closed)) left--;
  }
  if (guard >= 366) return null;
  const minutesToCutoff = beforeCutoff ? cutoff * 60 - (clock.hour * 60 + clock.minute) : null;
  return { date: day, minutesToCutoff };
}

/** Which Text & labels line says it: the countdown inside the last `countdownHours` before the cut-off, else the plain line. */
export function shipByCopy(s: ShipBy, dateText: string, countdownHours: number,
  keys: { plain: string; countdown: string } = { plain: "pdpShipBy", countdown: "pdpShipByCountdown" }): { key: string; values: Record<string, string> } {
  const m = s.minutesToCutoff;
  if (m !== null && m > 0 && countdownHours > 0 && m <= countdownHours * 60) {
    return { key: keys.countdown, values: { date: dateText, hours: String(Math.floor(m / 60)), minutes: String(m % 60) } };
  }
  return { key: keys.plain, values: { date: dateText } };
}

/** "Monday, Oct 26" in the shopper's language (the date is a Toronto calendar date). */
export function formatShipDate(date: string, locale?: string): string {
  if (!DATE_ONLY.test(date)) return "";
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  } catch {
    return date;
  }
}
