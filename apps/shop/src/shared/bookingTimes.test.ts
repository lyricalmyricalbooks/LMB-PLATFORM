import { describe, expect, it } from "vitest";
import {
  addDays, bookingIcs, cleanBookingSettings, cleanService, clashes, customerCanChange, dayOf, daysTouched, DEFAULT_BOOKING_SETTINGS,
  cleanAnswers, cleanClassTimes, cleanQuestions, freeTimes, placesLeft, googleCalendarLink, isFreeTime, MAX_QUESTIONS, zonedTime,
  secondReminderDue, summaryDue,
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

describe("questions on the booking form", () => {
  it("keeps at most five questions, drops empty ones and gives each its own id", () => {
    const raw = [
      { id: "size", label: " What size? ", required: true },
      { label: "" },
      { id: "size", label: "Anything else?", long: true },
      ...Array.from({ length: 6 }, (_, i) => ({ label: `Extra ${i}` })),
    ];
    const clean = cleanQuestions(raw);
    expect(clean).toHaveLength(MAX_QUESTIONS);
    expect(clean[0]).toEqual({ id: "size", label: "What size?", long: false, required: true });
    expect(clean[1]).toMatchObject({ id: "sizex", long: true, required: false });
    expect(new Set(clean.map((q) => q.id)).size).toBe(MAX_QUESTIONS);
    expect(cleanQuestions("nope")).toEqual([]);
  });

  it("refuses a missing must-answer question, unless the owner is booking", () => {
    const questions = cleanQuestions([{ id: "a", label: "Paper size", required: true }, { id: "b", label: "Notes", long: true }]);
    expect(cleanAnswers(questions, { b: "hello" })).toEqual({ problem: "Please answer: Paper size", questionId: "a" });
    expect(cleanAnswers(questions, { a: "   " })).toMatchObject({ questionId: "a" });
    expect(cleanAnswers(questions, {}, false)).toEqual({ answers: [] });
    expect(cleanAnswers(questions, { a: " A3 ", b: "x".repeat(2000), c: "ignored" })).toEqual({
      answers: [{ label: "Paper size", answer: "A3" }, { label: "Notes", answer: "x".repeat(1000) }],
    });
  });
});

describe("group classes", () => {
  const workshop = { id: "ws", minutes: 120, gapAfter: 0, places: 3, classTimes: [{ weekday: 6, time: "14:00" }] };
  const sat = at("2026-11-21", "14:00");
  const taken = (n: number) => Array.from({ length: n }, () => ({ start: sat, end: sat + 120 * 60_000, serviceId: "ws" }));

  it("counts the places left at one start and stops at full", () => {
    expect(placesLeft(sat, workshop, [])).toBe(3);
    expect(placesLeft(sat, workshop, taken(2))).toBe(1);
    expect(placesLeft(sat, workshop, taken(3))).toBe(0);
    expect(clashes(sat, workshop, taken(2))).toBe(false);
  });

  it("shares a time only with the same class at the same start", () => {
    expect(placesLeft(sat, workshop, [{ start: sat, end: sat + 3_600_000, serviceId: "other" }])).toBe(0);
    expect(placesLeft(sat, workshop, [{ start: sat, end: sat + 3_600_000 }])).toBe(0);
    expect(placesLeft(sat + 30 * 60_000, workshop, taken(1))).toBe(0);
    // One customer at a time never shares, whatever the id.
    expect(placesLeft(sat, { ...workshop, places: 1 }, taken(1))).toBe(0);
  });

  it("offers a class at its own weekly times, outside the opening hours too, and not once full", () => {
    expect(freeTimes({ service: workshop, settings, busy: taken(2), day: "2026-11-21", zone: ZONE, nowMs: NOW })).toEqual([sat]);
    expect(freeTimes({ service: workshop, settings, busy: taken(3), day: "2026-11-21", zone: ZONE, nowMs: NOW })).toEqual([]);
    expect(freeTimes({ service: workshop, settings, busy: [], day: "2026-11-20", zone: ZONE, nowMs: NOW })).toEqual([]);
    expect(freeTimes({ service: workshop, settings: { ...settings, daysOff: ["2026-11-21"] }, busy: [], day: "2026-11-21", zone: ZONE, nowMs: NOW })).toEqual([]);
    // Without its own times a class follows the opening hours like any service.
    expect(freeTimes({ service: { ...workshop, classTimes: [] }, settings, busy: [], day: "2026-11-21", zone: ZONE, nowMs: NOW })).toEqual([]);
    expect(freeTimes({ service: { ...workshop, classTimes: [] }, settings, busy: [], day: "2026-11-20", zone: ZONE, nowMs: NOW }).length).toBeGreaterThan(3);
  });

  it("cleans the weekly times", () => {
    expect(cleanClassTimes([{ weekday: 6, time: "14:00" }, { weekday: 1, time: "09:30" }, { weekday: 6, time: "14:00" }, { weekday: 7, time: "10:00" }, { weekday: 2, time: "25:00" }, "x"]))
      .toEqual([{ weekday: 1, time: "09:30" }, { weekday: 6, time: "14:00" }]);
    expect(cleanService({ name: "Solo", minutes: 30 })).toMatchObject({ places: 1, classTimes: [] });
    expect(cleanService({ name: "Big", minutes: 30, places: 5000 })).toMatchObject({ places: 100 });
  });
});

describe("deposits", () => {
  it("works out what a service takes by card when booked", async () => {
    const { depositOf } = await import("./bookingTimes");
    expect(depositOf({ payment: "full", priceMinor: 6000 })).toBe(6000);
    expect(depositOf({ payment: "deposit", priceMinor: 14000, depositPercent: 25 })).toBe(3500);
    expect(depositOf({ payment: "deposit", priceMinor: 14000, depositMinor: 2000, depositPercent: 25 })).toBe(2000);
    expect(depositOf({ payment: "atShop", priceMinor: 6000 })).toBe(0);
    expect(depositOf({ payment: "free", priceMinor: 0 })).toBe(0);
  });
  it("reads a booking's money the same way everywhere", async () => {
    const { balanceDue, cardAsk, cardTaken, moneyKept, moneyTaken } = await import("./bookingTimes");
    const dep = { payment: "deposit", priceMinor: 14000, depositMinor: 3500, depositPaid: true };
    expect([cardAsk(dep), cardTaken(dep), moneyTaken(dep), balanceDue(dep)]).toEqual([3500, 3500, 3500, 10500]);
    expect([cardTaken({ ...dep, paid: true }), moneyTaken({ ...dep, paid: true }), balanceDue({ ...dep, paid: true })]).toEqual([3500, 14000, 0]);
    expect(balanceDue({ ...dep, status: "cancelled" })).toBe(0);
    expect(moneyKept({ ...dep, refund: { amountMinor: 1000 } })).toBe(2500);
    expect([cardAsk({ payment: "card", priceMinor: 4000 }), cardTaken({ payment: "card", priceMinor: 4000 }), cardTaken({ payment: "card", priceMinor: 4000, paid: true })]).toEqual([4000, 0, 4000]);
    expect([cardTaken({ payment: "atShop", priceMinor: 6000, paid: true }), balanceDue({ payment: "atShop", priceMinor: 6000 })]).toEqual([0, 6000]);
  });
  it("counts what is left once it is paid later by card from the booking page", async () => {
    const { balanceDue, bookedCardTaken, cardTaken, moneyTaken, restPayable, restTaken } = await import("./bookingTimes");
    const dep = { payment: "deposit", priceMinor: 14000, depositMinor: 3500, depositPaid: true, status: "confirmed" };
    expect(restPayable(dep)).toBe(true);
    const done = { ...dep, rest: { amountMinor: 10500 } };
    expect([bookedCardTaken(done), restTaken(done), cardTaken(done), moneyTaken(done), balanceDue(done), restPayable(done)]).toEqual([3500, 10500, 14000, 14000, 0, false]);
    const shop = { payment: "atShop", priceMinor: 6000, status: "confirmed" };
    expect([restPayable(shop), cardTaken({ ...shop, rest: { amountMinor: 6000 } }), balanceDue({ ...shop, rest: { amountMinor: 6000 } })]).toEqual([true, 6000, 0]);
    // Below the card minimum, a held booking or a cancelled one: no pay button.
    expect([restPayable({ ...shop, priceMinor: 40 }), restPayable({ ...shop, status: "held" }), restPayable({ ...shop, status: "cancelled" }), restPayable({ ...shop, paid: true })]).toEqual([false, false, false, false]);
  });
});

describe("card on file and the missed-booking fee", () => {
  it("keeps a card only where something is left to charge, with a fee no higher than the price", async () => {
    const { cleanService } = await import("./bookingTimes");
    expect(cleanService({ name: "Cut", minutes: 45, payment: "atShop", priceMinor: 6000, holdCard: true, lateFeeMinor: 3000 })).toMatchObject({ holdCard: true, lateFeeMinor: 3000 });
    expect(cleanService({ name: "Cut", minutes: 45, payment: "full", priceMinor: 6000, holdCard: true, lateFeeMinor: 3000 })).toMatchObject({ holdCard: false, lateFeeMinor: 0 });
    expect(cleanService({ name: "Cut", minutes: 45, payment: "atShop", priceMinor: 6000, holdCard: true, lateFeeMinor: 7000 })).toEqual({ problem: expect.stringMatching(/more than the price/) });
    expect(cleanService({ name: "Chat", minutes: 20, payment: "free", holdCard: true, lateFeeMinor: 20 })).toEqual({ problem: expect.stringMatching(/0.50/) });
    expect(cleanService({ name: "Chat", minutes: 20, payment: "free", holdCard: true, lateFeeMinor: 2500 })).toMatchObject({ holdCard: true, lateFeeMinor: 2500 });
    expect(cleanService({ name: "Chat", minutes: 20 })).toMatchObject({ holdCard: false, lateFeeMinor: 0 });
  });
  it("counts a fee as money taken but never against the price still to pay", async () => {
    const { balanceDue, feeTaken, moneyKept, moneyTaken } = await import("./bookingTimes");
    const b = { payment: "atShop", priceMinor: 6000, fee: { amountMinor: 3000 } };
    expect([feeTaken(b), moneyTaken(b), moneyKept(b), balanceDue(b)]).toEqual([3000, 3000, 3000, 6000]);
  });
  it("lets the owner charge the fee after a no-show or the shop's own cancel, never after the customer's", async () => {
    const { feeChargeable } = await import("./bookingTimes");
    const now = Date.parse("2026-11-20T15:00:00Z");
    const b = { card: { customer: "cus_1", paymentMethod: "pm_1" }, lateFeeMinor: 3000, status: "confirmed", start: "2026-11-20T14:00:00Z" };
    expect(feeChargeable(b, now)).toBe(true);
    expect(feeChargeable({ ...b, start: "2026-11-20T16:00:00Z" }, now)).toBe(false);
    expect(feeChargeable({ ...b, status: "cancelled", cancelledBy: "owner@example.com", start: "2026-11-20T16:00:00Z" }, now)).toBe(true);
    expect(feeChargeable({ ...b, status: "cancelled", cancelledBy: "customer" }, now)).toBe(false);
    expect(feeChargeable({ ...b, fee: { amountMinor: 3000 } }, now)).toBe(false);
    expect(feeChargeable({ ...b, card: null }, now)).toBe(false);
  });
});

describe("the second reminder and the morning list", () => {
  it("keeps the second reminder only when it is a listed choice under the first", () => {
    expect(cleanBookingSettings({}).secondReminderHours).toBe(0);
    expect(cleanBookingSettings({ reminderHours: 24, secondReminderHours: 2 }).secondReminderHours).toBe(2);
    expect(cleanBookingSettings({ reminderHours: 2, secondReminderHours: 2 }).secondReminderHours).toBe(0);
    expect(cleanBookingSettings({ reminderHours: 24, secondReminderHours: 5 }).secondReminderHours).toBe(0);
    expect(cleanBookingSettings({ reminderHours: 0, secondReminderHours: 3 }).secondReminderHours).toBe(3);
    expect(cleanBookingSettings({ dailySummary: "yes" }).dailySummary).toBe(false);
    expect(cleanBookingSettings({ dailySummary: true }).dailySummary).toBe(true);
  });

  it("is due inside its hours, never twice, never in the last 15 minutes, never for a booking made inside them", () => {
    const start = new Date(at("2026-11-18", "14:00")).toISOString();
    const made = new Date(at("2026-11-16", "09:00")).toISOString();
    expect(secondReminderDue({ start, createdAt: made }, 2, at("2026-11-18", "11:30"))).toBe(false);
    expect(secondReminderDue({ start, createdAt: made }, 2, at("2026-11-18", "12:30"))).toBe(true);
    expect(secondReminderDue({ start, createdAt: made, reminder2SentAt: "x" }, 2, at("2026-11-18", "12:30"))).toBe(false);
    expect(secondReminderDue({ start, createdAt: made }, 2, at("2026-11-18", "13:50"))).toBe(false);
    expect(secondReminderDue({ start, createdAt: new Date(at("2026-11-18", "12:15")).toISOString() }, 2, at("2026-11-18", "12:30"))).toBe(false);
    expect(secondReminderDue({ start, createdAt: made }, 0, at("2026-11-18", "12:30"))).toBe(false);
  });

  it("gives the shop's day from 7 in the morning, once", () => {
    expect(summaryDue(at("2026-11-18", "06:59"), ZONE, "")).toBe("");
    expect(summaryDue(at("2026-11-18", "07:00"), ZONE, "")).toBe("2026-11-18");
    expect(summaryDue(at("2026-11-18", "23:30"), ZONE, "2026-11-17")).toBe("2026-11-18");
    expect(summaryDue(at("2026-11-18", "09:00"), ZONE, "2026-11-18")).toBe("");
    // 23:30 in Toronto is already the next day in UTC; the shop's own day still counts.
    expect(summaryDue(at("2026-11-18", "23:30"), ZONE, "2026-11-18")).toBe("");
  });
});
