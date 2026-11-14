// Bookings (beta): the admin page's pure rules (bookingsView.test.ts). Days and times are the shop's own
// (src/shared/shopTimeZone.ts), whatever the owner's computer is set to.
import { addDays, dayOf, weekdayOf } from "../../shared/bookingTimes";
import type { Booking } from "./bookingsApi";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** The Monday of the week a day falls in. */
export function weekStartOf(day: string): string {
  const wd = weekdayOf(day);
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

/** The seven days from a Monday. */
export const weekDays = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

export function timeText(iso: string, zone: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { timeZone: zone, hour: "numeric", minute: "2-digit" });
}

export function dayText(day: string, style: "short" | "long" = "short"): string {
  const d = new Date(`${day}T12:00:00Z`);
  return style === "long"
    ? d.toLocaleDateString(undefined, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
    : d.toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", day: "numeric" });
}

/** "16–22 November 2026", or across months "30 November – 6 December 2026". */
export function weekText(monday: string): string {
  const a = new Date(`${monday}T12:00:00Z`);
  const b = new Date(`${addDays(monday, 6)}T12:00:00Z`);
  const month = (d: Date) => d.toLocaleDateString(undefined, { timeZone: "UTC", month: "long" });
  const year = b.getUTCFullYear();
  return month(a) === month(b)
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${month(b)} ${year}`
    : `${a.getUTCDate()} ${month(a)} – ${b.getUTCDate()} ${month(b)} ${year}`;
}

export function moneyText(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** Bookings still on (held or confirmed), grouped by the shop's day, earliest first. */
export function byDay(rows: readonly Booking[], zone: string): Map<string, Booking[]> {
  const out = new Map<string, Booking[]>();
  for (const b of [...rows].sort((x, y) => x.start.localeCompare(y.start))) {
    if (b.status === "cancelled") continue;
    const day = dayOf(Date.parse(b.start), zone);
    out.set(day, [...(out.get(day) || []), b]);
  }
  return out;
}

/** The next booking still to come (or under way), or null. */
export function nextUp(rows: readonly Booking[], nowMs: number): Booking | null {
  return [...rows]
    .filter((b) => b.status === "confirmed" && Date.parse(b.end) > nowMs)
    .sort((a, b) => a.start.localeCompare(b.start))[0] || null;
}

/** "in 25 minutes", "in 3 hours", "tomorrow", "on Friday", "now" for the Next up tile. */
export function whenFromNow(b: Booking, nowMs: number, zone: string): string {
  const start = Date.parse(b.start);
  if (start <= nowMs) return "now";
  const mins = Math.round((start - nowMs) / 60_000);
  if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  const today = dayOf(nowMs, zone);
  const day = dayOf(start, zone);
  if (day === today) return `in ${Math.round(mins / 60)} hour${Math.round(mins / 60) === 1 ? "" : "s"}`;
  if (day === addDays(today, 1)) return "tomorrow";
  if (day <= addDays(today, 6)) return `on ${WEEKDAYS[weekdayOf(day)]}`;
  return `on ${dayText(day, "long")}`;
}

/** How a booking is paid, in plain words. */
export function paymentText(b: Pick<Booking, "payment" | "paid" | "priceMinor" | "currency" | "refund" | "status">): string {
  if (b.refund?.amountMinor) return `Refunded ${moneyText(b.refund.amountMinor, b.currency)}`;
  if (b.payment === "free") return "Free";
  if (b.payment === "card") return b.paid ? `Paid ${moneyText(b.priceMinor, b.currency)} by card` : b.status === "held" ? "Paying now" : "Not paid";
  return b.paid ? `Paid ${moneyText(b.priceMinor, b.currency)} at the shop` : `${moneyText(b.priceMinor, b.currency)} to pay at the shop`;
}

/** The figures over the week strip: bookings this week, hours booked, and money taken by card. */
export function weekFigures(rows: readonly Booking[]): { count: number; hours: number; takenMinor: number } {
  const live = rows.filter((b) => b.status === "confirmed");
  return {
    count: live.length,
    hours: Math.round(live.reduce((n, b) => n + b.minutes, 0) / 6) / 10,
    takenMinor: live.reduce((n, b) => n + (b.paid ? b.priceMinor : 0), 0),
  };
}

/** The opening hours one line per day ("Mon 10:00–17:00"). */
export const hoursLine = (windows: { start: string; end: string }[]): string => (windows.length ? windows.map((w) => `${w.start}–${w.end}`).join(", ") : "Closed");
