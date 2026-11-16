// Home for a services shop (services plan, phase 1): the day is its appointments, not parcels and stock. Pure rules for
// HomeServices.tsx, over the bookings Home follows (two weeks back, to catch what was never marked paid, and a week on).
import { addDays, balanceDue, dayOf, moneyTaken } from "../../../shared/bookingTimes";
import type { Booking } from "../bookingsApi";

/** How far back and ahead Home reads bookings. */
export const HOME_BOOKINGS_BACK_DAYS = 14;
export const HOME_BOOKINGS_AHEAD_DAYS = 8;
/** Bars on the Today tile: today and the six days after it. */
export const HOME_BAR_DAYS = 7;

const on = (b: Booking) => b.status === "confirmed";

export type ServicesDay = {
  /** Today's appointments still on, earliest first (finished ones included: the day at a glance). */
  today: Booking[];
  /** The appointment under way or next today, or null. */
  next: Booking | null;
  /** After today, earliest first. */
  upcoming: Booking[];
  /** Appointments per day, today first. */
  bars: number[];
  /** Today and the six days after: how many, hours booked, and money already taken. */
  week: { count: number; hours: number; takenMinor: number };
  /** Finished, to be paid at the shop, and never marked paid: the owner's to-do. */
  unpaid: Booking[];
};

export function servicesDay(rows: readonly Booking[], nowMs: number, zone: string): ServicesDay {
  const live = rows.filter(on).sort((a, b) => a.start.localeCompare(b.start));
  const todayKey = dayOf(nowMs, zone);
  const dayKey = (b: Booking) => dayOf(Date.parse(b.start), zone);
  const today = live.filter((b) => dayKey(b) === todayKey);
  const days = Array.from({ length: HOME_BAR_DAYS }, (_, i) => addDays(todayKey, i));
  const inWeek = live.filter((b) => days.includes(dayKey(b)));
  return {
    today,
    next: today.find((b) => Date.parse(b.end) > nowMs) || null,
    upcoming: live.filter((b) => dayKey(b) > todayKey),
    bars: days.map((d) => inWeek.filter((b) => dayKey(b) === d).length),
    week: {
      count: inWeek.length,
      hours: Math.round(inWeek.reduce((n, b) => n + b.minutes, 0) / 6) / 10,
      takenMinor: inWeek.reduce((n, b) => n + moneyTaken(b), 0),
    },
    unpaid: live.filter((b) => (b.payment === "atShop" || b.payment === "deposit") && !b.noShow && balanceDue(b) > 0 && Date.parse(b.end) <= nowMs),
  };
}

/** "3 appointments today", "1 appointment today", "Nothing booked today". */
export function todayLine(count: number): string {
  return count === 0 ? "Nothing booked today" : `${count} appointment${count === 1 ? "" : "s"} today`;
}
