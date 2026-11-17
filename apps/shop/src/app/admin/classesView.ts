// Admin › Classes (beta, ways to sell; tasks/todo/2026-11-17-classes-timetable-admin.md): the pure rules behind the
// timetable. A class is a Bookings service with more than one place (shared/bookingTimes `isClass`), so every figure
// here is read from the same services, settings and bookings the Bookings page shows; nothing is kept twice.
import { booksByPerson, classStartsOn, courseStarts, dayOf, isClass, isCourse, staffFor, type BookingService, type BookingSettings } from "../../shared/bookingTimes";
import type { Booking } from "./bookingsApi";
import { WEEKDAYS, weekDays } from "./bookingsView";

/** One dated class: on the timetable because the class runs then each week, or because someone is booked into it. */
export type ClassSession = {
  key: string; serviceId: string; name: string; start: string; end: string; places: number;
  /** Everyone holding a place: confirmed, and held while they pay. Cancelled bookings are left out. */
  people: Booking[];
  teacher: string; room: string;
  /** False for a booked start that isn't one of the class's weekly times any more (the class was changed since). */
  scheduled: boolean; past: boolean;
};
export type ClassDay = { day: string; closed: boolean; sessions: ClassSession[] };

/** Who teaches a class when nobody is booked yet: the one person who takes it, else nobody named. */
function usualTeacher(settings: Pick<BookingSettings, "staff">, serviceId: string): string {
  if (!booksByPerson(settings)) return "";
  const people = staffFor(settings, serviceId);
  return people.length === 1 ? people[0].name : "";
}

/**
 * The week's classes, day by day (Monday first): every weekly time of every class customers can book, plus any start
 * people are booked into. A day off shows only the classes someone is already in.
 */
export function classWeek({ services, settings, rows, monday, zone, nowMs }: {
  services: readonly BookingService[]; settings: Pick<BookingSettings, "staff" | "rooms" | "daysOff">; rows: readonly Booking[]; monday: string; zone: string; nowMs: number;
}): ClassDay[] {
  const classes = services.filter(isClass);
  const byId = new Map(classes.map((s) => [s.id, s]));
  return weekDays(monday).map((day) => {
    const closed = settings.daysOff.includes(day);
    const found = new Map<string, ClassSession>();
    const session = (s: BookingService, startMs: number, scheduled: boolean): ClassSession => {
      const key = `${s.id}@${startMs}`;
      let it = found.get(key);
      if (!it) {
        it = {
          key, serviceId: s.id, name: s.name, start: new Date(startMs).toISOString(), end: new Date(startMs + s.minutes * 60_000).toISOString(), places: s.places,
          people: [], teacher: usualTeacher(settings, s.id), room: settings.rooms.find((r) => r.id === s.roomId)?.name || "", scheduled, past: startMs + s.minutes * 60_000 <= nowMs,
        };
        found.set(key, it);
      }
      return it;
    };
    if (!closed) for (const s of classes) if (s.active) for (const ms of classStartsOn(day, s, zone)) session(s, ms, true);
    // A course runs on its own dates, a day off or not (the owner chose them).
    for (const s of classes) if (s.active) for (const ms of courseStarts(s, zone)) if (dayOf(ms, zone) === day) session(s, ms, true);
    const seen = new Set<string>();
    for (const b of rows) {
      const s = byId.get(b.serviceId);
      if (!s || b.status === "cancelled" || seen.has(b.id)) continue;
      seen.add(b.id);
      // Someone on a course holds a place on every one of its dates.
      const starts = b.course?.starts?.length ? b.course.starts.map((iso) => Date.parse(iso)) : [Date.parse(b.start)];
      for (const startMs of starts) {
        if (!Number.isFinite(startMs) || dayOf(startMs, zone) !== day) continue;
        const it = session(s, startMs, false);
        it.people.push(b);
        if (b.staffName) it.teacher = b.staffName;
        if (b.roomName) it.room = b.roomName;
      }
    }
    const sessions = [...found.values()].sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
    for (const it of sessions) it.people.sort((a, b) => a.customer.name.localeCompare(b.customer.name));
    return { day, closed, sessions };
  });
}

export type ClassFigures = { sessions: number; booked: number; places: number; next: ClassSession | null };

/** The week at a glance: classes on, places booked of all places, and the next class still to come. */
export function classFigures(week: readonly ClassDay[]): ClassFigures {
  const all = week.flatMap((d) => d.sessions);
  return {
    sessions: all.length,
    booked: all.reduce((n, s) => n + s.people.length, 0),
    places: all.reduce((n, s) => n + s.places, 0),
    next: all.find((s) => !s.past) || null,
  };
}

/** A weekly time ("18:30") the way the timetable writes clock times ("6:30 PM" or "18:30", by the reader's own habit). */
const clock = (time: string): string => {
  const [h, m] = time.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? new Date(Date.UTC(2026, 0, 1, h, m)).toLocaleTimeString(undefined, { timeZone: "UTC", hour: "numeric", minute: "2-digit" }) : time;
};

/** "Mondays 6:00 PM · Thursdays 6:00 PM", or what an untimed class does instead. */
export function classTimesText(s: Pick<BookingService, "classTimes" | "places" | "courseDates">): string {
  if (isCourse(s)) {
    const first = s.courseDates![0];
    const [y, m, d] = first.slice(0, 10).split("-").map(Number);
    const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
    return `Course · ${s.courseDates!.length} dates from ${day}, ${clock(first.slice(11, 16))}`;
  }
  if (!s.classTimes.length) return "Any free time in your hours";
  return s.classTimes.map((t) => `${WEEKDAYS[t.weekday]}s ${clock(t.time)}`).join(" · ");
}

/** A session's line under its name: "Ana · Print room", either part alone, or nothing. */
export const sessionPlace = (s: Pick<ClassSession, "teacher" | "room">): string => [s.teacher, s.room].filter(Boolean).join(" · ");

/** How a person on the class list stands: here, paying, missed, or nothing to say. */
export function personTag(b: Pick<Booking, "status" | "clearing" | "noShow" | "checkedInAt">): string {
  if (b.status === "held") return b.clearing ? "Payment clearing" : "Paying now";
  if (b.noShow) return "No-show";
  return b.checkedInAt ? "Here" : "";
}
