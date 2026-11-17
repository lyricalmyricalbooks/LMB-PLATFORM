import { describe, expect, it } from "vitest";
import { classFigures, classTimesText, classWeek, personTag, sessionPlace } from "./classesView";
import { DEFAULT_BOOKING_SETTINGS, cleanService, zonedTime, type BookingService } from "../../shared/bookingTimes";
import type { Booking } from "./bookingsApi";

const ZONE = "America/Toronto";
const iso = (day: string, hhmm: string) => new Date(zonedTime(day, hhmm, ZONE)).toISOString();
const svc = (id: string, extra: Record<string, unknown>) => cleanService({ name: id, minutes: 90, payment: "free", ...extra }, id) as BookingService;
const wheel = svc("wheel", { name: "Wheel basics", places: 6, classTimes: [{ weekday: 1, time: "18:00" }, { weekday: 4, time: "18:00" }], roomId: "studio" });
const hidden = svc("glaze", { name: "Glazing", places: 4, active: false, classTimes: [{ weekday: 2, time: "10:00" }] });
const visit = svc("visit", { name: "Studio visit" });
const settings = { ...DEFAULT_BOOKING_SETTINGS, rooms: [{ id: "studio", name: "Studio" }], daysOff: ["2026-11-19"] };
const booking = (id: string, serviceId: string, start: string, extra: Partial<Booking> = {}): Booking => ({
  id, serviceId, serviceName: serviceId, minutes: 90, start, end: start, customer: { name: id, email: `${id}@example.com` }, status: "confirmed",
  payment: "free", priceMinor: 0, currency: "CAD", paid: false, ...extra,
});
const MONDAY = "2026-11-16";
const NOW = zonedTime("2026-11-17", "08:00", ZONE);

describe("the week's classes", () => {
  const rows = [
    booking("Bea", "wheel", iso("2026-11-16", "18:00")), booking("Ada", "wheel", iso("2026-11-16", "18:00"), { status: "held" }),
    booking("Cy", "wheel", iso("2026-11-16", "18:00"), { status: "cancelled" }),
    booking("Dee", "wheel", iso("2026-11-19", "18:00"), { staffName: "Rui", roomName: "Back room" }),
    booking("Eve", "wheel", iso("2026-11-21", "11:00")),
    booking("Fay", "visit", iso("2026-11-17", "10:00")), booking("Gus", "glaze", iso("2026-11-17", "10:00")),
  ];
  const week = classWeek({ services: [wheel, hidden, visit], settings, rows, monday: MONDAY, zone: ZONE, nowMs: NOW });

  it("lists every weekly time, booked or not, with who holds a place", () => {
    expect(week.map((d) => d.day)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    const mon = week[0].sessions;
    expect(mon).toHaveLength(1);
    expect(mon[0]).toMatchObject({ serviceId: "wheel", name: "Wheel basics", places: 6, start: iso("2026-11-16", "18:00"), room: "Studio", scheduled: true, past: true });
    expect(mon[0].people.map((b) => b.id)).toEqual(["Ada", "Bea"]);
  });
  it("leaves out one-customer services, and shows a hidden class only where someone is booked", () => {
    expect(week[1].sessions.map((s) => [s.name, s.people.length, s.scheduled])).toEqual([["Glazing", 1, false]]);
    expect(week[2].sessions).toEqual([]);
  });
  it("shows a day off as closed, keeping a class someone is already in, with the teacher and room it was booked with", () => {
    expect(week[3].closed).toBe(true);
    expect(week[3].sessions.map((s) => [s.people.map((b) => b.id), s.teacher, s.room, s.scheduled])).toEqual([[["Dee"], "Rui", "Back room", false]]);
  });
  it("keeps a booked start that is no longer one of the weekly times", () => {
    expect(week[5].sessions.map((s) => [s.start, s.scheduled])).toEqual([[iso("2026-11-21", "11:00"), false]]);
  });
  it("adds the week up and finds the next class to come", () => {
    const f = classFigures(week);
    expect([f.sessions, f.booked, f.places]).toEqual([4, 5, 22]);
    expect(f.next?.start).toBe(iso("2026-11-17", "10:00"));
    expect(classFigures([]).next).toBeNull();
  });
  it("names the one person who takes a class before anyone books", () => {
    const team = { ...settings, daysOff: [], staff: [{ id: "rui", name: "Rui", active: true, serviceIds: ["wheel"], ownHours: false, hours: settings.hours, daysOff: [], email: "" }] };
    const w = classWeek({ services: [wheel], settings: team as typeof settings, rows: [], monday: MONDAY, zone: ZONE, nowMs: NOW });
    expect(w[3].sessions[0].teacher).toBe("Rui");
  });
});

describe("words", () => {
  it("says when a class runs, where, and how a person stands", () => {
    expect(classTimesText(wheel)).toMatch(/^Mondays 6:00\sPM · Thursdays 6:00\sPM$/);
    expect(classTimesText({ classTimes: [] })).toBe("Any free time in your hours");
    expect(sessionPlace({ teacher: "Rui", room: "Studio" })).toBe("Rui · Studio");
    expect(sessionPlace({ teacher: "", room: "Studio" })).toBe("Studio");
    expect(personTag({ status: "held", clearing: true })).toBe("Payment clearing");
    expect(personTag({ status: "confirmed", checkedInAt: "2026-11-16T23:00:00Z" })).toBe("Here");
    expect(personTag({ status: "confirmed", noShow: true })).toBe("No-show");
    expect(personTag({ status: "confirmed" })).toBe("");
  });
});
