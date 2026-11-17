// The Timetable page inside Studio's preview: a sample week, so an owner can design the page before adding a class and
// whether or not Classes is switched on. Only a real Studio preview gets it (bookTimePreview.ts `isBookingPreview`).
// The sample class ids are Book a time's own sample class, so Sign up lands on a sample that can be booked in preview.
import { addDays, dayOf, weekdayOf, zonedTime } from "../../../shared/bookingTimes";
import { shopTimeZone } from "../../../shared/shopTimeZone";
import type { ClassSessionView, ClassView, CourseView, TimetableInfo } from "./classesRules";

const CLASSES: ClassView[] = [
  { id: "sample-class", name: "Saturday workshop", description: "Sample class. Yours show here once you add them under Classes.", minutes: 120, priceMinor: 6000, payment: "deposit", location: "The studio", places: 8 },
  { id: "sample-evening", name: "Evening class", description: "A weekly class with a set number of places.", minutes: 90, priceMinor: 3500, payment: "full", location: "The studio", places: 10, plusTax: true },
  { id: "sample-taster", name: "Free taster", description: "Come and try it.", minutes: 45, priceMinor: 0, payment: "free", location: "", places: 6 },
];
/** Which weekdays (0 Sunday … 6 Saturday) each sample class runs, at what time, and the places left that week. */
const WEEKLY: { classId: string; weekday: number; time: string; left: number }[] = [
  { classId: "sample-evening", weekday: 2, time: "18:30", left: 6 },
  { classId: "sample-taster", weekday: 3, time: "12:15", left: 1 },
  { classId: "sample-evening", weekday: 4, time: "18:30", left: 2 },
  { classId: "sample-class", weekday: 6, time: "10:00", left: 0 },
  { classId: "sample-class", weekday: 6, time: "14:00", left: 5 },
];

export function previewTimetable(body: Record<string, any> = {}, currency = "CAD", nowMs = Date.now(), zone = shopTimeZone()): TimetableInfo {
  const today = dayOf(nowMs, zone);
  const lastDay = addDays(today, 60);
  const asked = typeof body.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.from) ? body.from : today;
  const from = asked < today ? today : asked > lastDay ? lastDay : asked;
  const sessions: ClassSessionView[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(from, i);
    for (const w of WEEKLY) if (w.weekday === weekdayOf(day)) sessions.push({ classId: w.classId, day, start: new Date(zonedTime(day, w.time, zone)).toISOString(), left: w.left });
  }
  // A sample course: four Thursdays, starting next week.
  const firstThursday = addDays(today, ((4 - weekdayOf(today) + 7) % 7) + 7);
  const courses: CourseView[] = [{
    id: "sample-course", name: "Four-week beginners' course", description: "A sample course. One sign-up covers every date.", minutes: 120, priceMinor: 18000, payment: "full", location: "The studio", places: 8,
    starts: [0, 7, 14, 21].map((n) => new Date(zonedTime(addDays(firstThursday, n), "18:30", zone)).toISOString()), left: 3,
  }];
  return { on: true, zone, currency, today, from, lastDay, classes: CLASSES, sessions, courses };
}
