import { describe, expect, it } from "vitest";
import {
  addDays, bookingIcs, cleanBookingSettings, cleanService, clashes, customerCanChange, dayOf, daysTouched, DEFAULT_BOOKING_SETTINGS,
  freeTimes, googleCalendarLink, isFreeTime, zonedTime,
} from "./bookingTimes";

const ZONE = "America/Toronto";
const service = { minutes: 60, gapAfter: 0 };
const settings = { ...DEFAULT_BOOKING_SETTINGS, live: true, minNoticeHours: 0 };
// Monday 16 November 2026, 08:00 in Toronto.
const NOW = zonedTime("2026-11-16", "08:00", ZONE);
const at = (day: string, hhmm: string) => zonedTime(day, hhmm, ZONE);
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" });

describe("the shop's clock", () => {
  it("turns a wall time in the shop's zone into the right moment, either side of a clock change", () => {
    expect(new Date(at("2026-11-16", "10:00")).toISOString()).toBe("2026-11-16T15:00:00.000Z");
    expect(new Date(at("2026-07-16", "10:00")).toISOString()).toBe("2026-07-16T14:00:00.000Z");
    expect(new Date(zonedTime("2026-11-16", "10:00", "America/Los_Angeles")).toISOString()).toBe("2026-11-16T18:00:00.000Z");
  });
  it("names the shop's day, not the server's", () => {
    expect(dayOf(Date.parse("2026-11-17T03:00:00Z"), ZONE)).toBe("2026-11-16");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysTouched(at("2026-11-16", "23:30"), at("2026-11-17", "00:30"), ZONE)).toEqual(["2026-11-16", "2026-11-17"]);
    expect(daysTouched(at("2026-11-16", "10:00"), at("2026-11-16", "11:00"), ZONE)).toEqual(["2026-11-16"]);
  });
});

describe("free times", () => {
  it("offers each step inside the day's hours where the whole service fits", () => {
    const times = freeTimes({ service, settings, busy: [], day: "2026-11-16", zone: ZONE, nowMs: NOW });
    expect(times.map(hhmm)).toEqual(["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"]);
  });
  it("offers nothing on a closed weekday, a day off, a past day or past the last bookable day", () => {
    expect(freeTimes({ service, settings, busy: [], day: "2026-11-15", zone: ZONE, nowMs: NOW })).toEqual([]);
    expect(freeTimes({ service, settings: { ...settings, daysOff: ["2026-11-17"] }, busy: [], day: "2026-11-17", zone: ZONE, nowMs: NOW })).toEqual([]);
    expect(freeTimes({ service, settings, busy: [], day: "2026-11-13", zone: ZONE, nowMs: NOW })).toEqual([]);
    expect(freeTimes({ service, settings: { ...settings, maxDaysAhead: 1 }, busy: [], day: "2026-11-18", zone: ZONE, nowMs: NOW })).toEqual([]);
  });
  it("keeps the notice the shop asks for", () => {
    const times = freeTimes({ service, settings: { ...settings, minNoticeHours: 5 }, busy: [], day: "2026-11-16", zone: ZONE, nowMs: NOW });
    expect(hhmm(times[0])).toBe("13:00");
  });
  it("leaves out times that overlap a booking, its rest after it included", () => {
    const busy = [{ start: at("2026-11-16", "12:00"), end: at("2026-11-16", "13:15") }];
    const times = freeTimes({ service, settings, busy, day: "2026-11-16", zone: ZONE, nowMs: NOW }).map(hhmm);
    expect(times).not.toContain("11:30");
    expect(times).not.toContain("13:00");
    expect(times).toContain("11:00");
    expect(times).toContain("13:30");
    // The new booking's own rest counts too: with 30 minutes after it, 11:00 would run into the noon booking.
    expect(clashes(at("2026-11-16", "11:00"), { minutes: 60, gapAfter: 30 }, busy)).toBe(true);
  });
  it("agrees with the server's check for one time", () => {
    expect(isFreeTime({ service, settings, busy: [], start: at("2026-11-16", "10:30"), zone: ZONE, nowMs: NOW })).toBe(true);
    expect(isFreeTime({ service, settings, busy: [], start: at("2026-11-16", "10:10"), zone: ZONE, nowMs: NOW })).toBe(false);
    expect(isFreeTime({ service, settings, busy: [], start: Number.NaN, zone: ZONE, nowMs: NOW })).toBe(false);
  });
  it("lets the customer change only up to the cancel window", () => {
    const start = at("2026-11-17", "10:00");
    expect(customerCanChange(start, { cancelHours: 24 }, at("2026-11-16", "09:59"))).toBe(true);
    expect(customerCanChange(start, { cancelHours: 24 }, at("2026-11-16", "10:01"))).toBe(false);
  });
});

describe("cleaning what the owner typed", () => {
  it("keeps a good service and refuses a broken one in plain words", () => {
    expect(cleanService({ name: " Studio visit ", minutes: "45", payment: "full", priceMinor: 2500, gapAfter: 15 }, "visit")).toMatchObject({ id: "visit", name: "Studio visit", minutes: 45, priceMinor: 2500, payment: "full", gapAfter: 15, active: true });
    expect(cleanService({ name: "Free chat", minutes: 20, payment: "free", priceMinor: 999 })).toMatchObject({ priceMinor: 0, payment: "free" });
    expect(cleanService({ name: "", minutes: 30 })).toEqual({ problem: expect.stringMatching(/name/) });
    expect(cleanService({ name: "x", minutes: 2 })).toEqual({ problem: expect.stringMatching(/5 minutes/) });
    expect(cleanService({ name: "x", minutes: 30, payment: "full", priceMinor: 10 })).toEqual({ problem: expect.stringMatching(/0.50/) });
  });
  it("cleans the hours: bad and overlapping windows go, numbers stay in range", () => {
    const hours = Array.from({ length: 7 }, () => [] as unknown[]);
    hours[1] = [{ start: "13:00", end: "17:00" }, { start: "09:00", end: "14:00" }, { start: "18:00", end: "17:00" }, { start: "25:00", end: "26:00" }];
    const clean = cleanBookingSettings({ hours, minNoticeHours: -5, maxDaysAhead: 9999, step: 7, daysOff: ["2026-11-20", "nope", "2026-11-20"] });
    expect(clean.hours[1]).toEqual([{ start: "09:00", end: "14:00" }]);
    expect(clean.minNoticeHours).toBe(0);
    expect(clean.maxDaysAhead).toBe(365);
    expect(clean.step).toBe(30);
    expect(clean.daysOff).toEqual(["2026-11-20"]);
    expect(cleanBookingSettings(null)).toEqual(DEFAULT_BOOKING_SETTINGS);
  });
});

describe("calendars", () => {
  it("writes a calendar file every calendar app opens, with its words made safe", () => {
    const ics = bookingIcs({ id: "b1", title: "Visit, studio; 1", start: Date.parse("2026-11-16T15:00:00Z"), end: Date.parse("2026-11-16T16:00:00Z"), nowMs: 0 });
    expect(ics).toContain("DTSTART:20261116T150000Z");
    expect(ics).toContain("SUMMARY:Visit\\, studio\\; 1");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });
  it("makes a Google Calendar link with the times filled in", () => {
    const link = new URL(googleCalendarLink({ title: "Visit", start: Date.parse("2026-11-16T15:00:00Z"), end: Date.parse("2026-11-16T16:00:00Z") }));
    expect(link.hostname).toBe("calendar.google.com");
    expect(link.searchParams.get("dates")).toBe("20261116T150000Z/20261116T160000Z");
  });
});
