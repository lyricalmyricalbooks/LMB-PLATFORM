// Timetable page (features/site/ClassesPage.tsx, Classes beta): the pure rules. Days and times are the shop's own (the
// server sends its time zone), so someone abroad sees the times the shop keeps. The server decides every place left
// (functions/bookings.js `classTimetable`); this only arranges what it answers.
import { addDays } from "../../../shared/bookingTimes";

export type ClassView = { id: string; name: string; description: string; minutes: number; priceMinor: number; payment: "free" | "full" | "deposit" | "atShop"; location: string; places: number;
  /** Sales tax is added on top of the price when signing up. */ plusTax?: boolean };
export type ClassSessionView = { classId: string; /** The shop's own day, "2026-11-21". */ day: string; start: string; left: number };
export type TimetableInfo = { on: boolean; zone?: string; currency?: string; today?: string; /** The first day of the week shown. */ from?: string; /** The last day customers can book. */ lastDay?: string;
  classes?: ClassView[]; sessions?: ClassSessionView[];
  /** Courses still open for sign-up, earliest first: every date, and the fewest places left across them. */ courses?: CourseView[] };
export type CourseView = ClassView & { starts: string[]; /** Left out when the server couldn't count them (signing up still checks). */ left?: number;
  /** Under way and still open to late joiners: the dates missed, of how many. */ joining?: { missed: number; of: number; fullPriceMinor: number } };

export type TimetableSession = ClassSessionView & { klass: ClassView };
export type TimetableDay = { day: string; sessions: TimetableSession[] };

/** The seven days from `from`, each with its classes, earliest first. A session whose class isn't listed is left out. */
export function timetableDays(info: Pick<TimetableInfo, "from" | "classes" | "sessions">): TimetableDay[] {
  if (!info.from) return [];
  const byId = new Map((info.classes || []).map((k) => [k.id, k]));
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(info.from!, i);
    const sessions = (info.sessions || []).filter((s) => s.day === day && byId.has(s.classId)).map((s) => ({ ...s, klass: byId.get(s.classId)! }))
      .sort((a, b) => a.start.localeCompare(b.start) || a.klass.name.localeCompare(b.klass.name));
    return { day, sessions };
  });
}

/** How full a class is: nobody can join, one place, a few (a third or fewer, at most 3), or plenty. */
export function placesState(left: number, places: number): "full" | "last" | "few" | "open" {
  if (left <= 0) return "full";
  if (left === 1) return "last";
  return left <= Math.min(3, Math.max(1, Math.floor(places / 3))) ? "few" : "open";
}

/** The week asked for in the address (`/classes?from=2026-11-23`), or "" for this week. */
export function weekFromSearch(search: string): string {
  const from = new URLSearchParams(search).get("from") || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : "";
}

/** The week before or after the one shown, or null where there is nothing to show (before today, past the last bookable day). */
export function weekStep(from: string, today: string, lastDay: string, dir: -1 | 1): string | null {
  if (dir < 0) {
    if (from <= today) return null;
    const back = addDays(from, -7);
    return back < today ? today : back;
  }
  const next = addDays(from, 7);
  return next > lastDay ? null : next;
}

/** Where Sign up goes: Book a time, with the class and its day already chosen. */
export const signUpPath = (classId: string, day: string): string => `/book?${new URLSearchParams({ service: classId, day }).toString()}`;

/** The week's dates the way the reader writes them: "16 – 22 November 2026" or "November 16 – 22, 2026". */
export function weekRangeText(from: string): string {
  const a = new Date(`${from}T12:00:00Z`);
  const b = new Date(`${addDays(from, 6)}T12:00:00Z`);
  return new Intl.DateTimeFormat(undefined, { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).formatRange(a, b);
}

/** "Saturday 21 November" for a shop day. */
export const dayHeading = (day: string): string => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
