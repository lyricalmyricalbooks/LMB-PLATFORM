import { describe, expect, it } from "vitest";
import { approvalAllowed,
  groupServices, serviceGroup, servicePhoto, MAX_GROUP_LENGTH, MAX_BIO_LENGTH,
  rebookDue,
  addDays, bookingIcs, cleanBookingSettings, cleanService, clashes, customerCanChange, dayOf, daysTouched, DEFAULT_BOOKING_SETTINGS,
  cleanAnswers, cleanClassTimes, cleanQuestions, freeTimes, placesLeft, googleCalendarLink, isFreeTime, MAX_QUESTIONS, zonedTime, runStarts,
  secondReminderDue, summaryDue, pickupSlots, pickupTimeProblem, PICKUP_DAYS_AHEAD, MAX_PICKUP_PER_SLOT,
  cleanCheckInCode, checkInCodeFrom, CHECK_IN_ALPHABET,
  cleanStaff, commissionOf, cleanRooms, staffFor, whoIsFree, MAX_STAFF, MAX_ROOMS, classStartsOn, joinableCourse, runDecisionDue, packProblem,
  cleanBlocks, blockOn, blockedBusy, MAX_BLOCKS, processingStretch,
  cleanSpecialHours, hoursOnDay, personHoursOn, specialOn, MAX_SPECIAL_DAYS, bookingsOnDay, ownerBookingSettings,
  roomUnits, roomUnitsText, MAX_ROOM_UNITS, classPlacesLeft,
  visitService, visitTimeline, visitStaff, visitFreeTimes, fitsAt, joinsVisit, MAX_VISIT_PARTS,
  cleanLengths, lengthName, withLength, MAX_LENGTHS, forPerson,
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
    // Spring forward: 2:30 doesn't happen, so it is 3:30 after the jump, never 1:30 (an hour early).
    expect(new Date(zonedTime("2027-03-14", "02:30", "America/Toronto")).toISOString()).toBe("2027-03-14T07:30:00.000Z");
    expect(new Date(zonedTime("2027-03-14", "01:30", "America/Toronto")).toISOString()).toBe("2027-03-14T06:30:00.000Z");
    // Fall back: 1:30 happens twice; the first one.
    expect(new Date(zonedTime("2026-11-01", "01:30", "America/Toronto")).toISOString()).toBe("2026-11-01T05:30:00.000Z");
    // A weekly run booked at 2:30 keeps its later visit on the clock-change day at 3:30, never an hour early.
    const run = runStarts(zonedTime("2027-03-07", "02:30", "America/Toronto"), { everyWeeks: 1, visits: 3 }, "America/Toronto");
    expect(run.map((ms) => new Date(ms).toISOString())).toEqual(["2027-03-07T07:30:00.000Z", "2027-03-14T07:30:00.000Z", "2027-03-21T06:30:00.000Z"]);
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

describe("tips", () => {
  it("keeps one to four tip choices from 1 to 50, and works them out from the price", async () => {
    const { cleanBookingSettings, cleanTipPercents, tipChoices, tipFits, tipLimitMinor, tipTaken } = await import("./bookingTimes");
    expect(cleanBookingSettings({}).tips).toBe(false);
    expect(cleanBookingSettings({ tips: true, tipPercents: [20, 10, 10, 0, 99, "15"] })).toMatchObject({ tips: true, tipPercents: [10, 15, 20] });
    expect([cleanTipPercents([]), cleanTipPercents("x"), cleanTipPercents([5, 10, 15, 20, 25])]).toEqual([[15, 18, 20], [15, 18, 20], [5, 10, 15, 20]]);
    expect(tipChoices(12500, [15, 18])).toEqual([{ percent: 15, amountMinor: 1875 }, { percent: 18, amountMinor: 2250 }]);
    expect([tipLimitMinor(3000), tipLimitMinor(25000)]).toEqual([10000, 25000]);
    expect([tipFits(50, 3000), tipFits(49, 3000), tipFits(10001, 3000), tipFits(1.5, 3000), tipFits("900", 3000)]).toEqual([true, false, false, false, false]);
    expect([tipTaken({}), tipTaken({ tip: { amountMinor: 900 } })]).toEqual([0, 900]);
  });
  it("opens a tip on its own only for a kept, priced visit that has started, for two weeks", async () => {
    const { tipOpen } = await import("./bookingTimes");
    const visit = { status: "confirmed", priceMinor: 6000, start: "2026-11-18T20:00:00.000Z", end: "2026-11-18T20:30:00.000Z" };
    const at = (iso: string) => Date.parse(iso);
    expect(tipOpen(visit, true, at("2026-11-18T19:59:00Z"))).toBe(false);
    expect(tipOpen(visit, true, at("2026-11-18T22:00:00Z"))).toBe(true);
    expect(tipOpen(visit, true, at("2026-12-03T00:00:00Z"))).toBe(false);
    expect([tipOpen(visit, false, at("2026-11-18T22:00:00Z")), tipOpen({ ...visit, noShow: true }, true, at("2026-11-18T22:00:00Z")), tipOpen({ ...visit, tip: { amountMinor: 1 } }, true, at("2026-11-18T22:00:00Z")),
      tipOpen({ ...visit, priceMinor: 0 }, true, at("2026-11-18T22:00:00Z")), tipOpen({ ...visit, status: "cancelled" }, true, at("2026-11-18T22:00:00Z"))]).toEqual([false, false, false, false, false]);
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

describe("gift cards on bookings", () => {
  it("takes the gift card's part off the card page and counts it once paid", async () => {
    const { balanceDue, bookedCardTaken, cardAsk, cardTaken, giftTaken, moneyKept, moneyTaken } = await import("./bookingTimes");
    const held = { payment: "card", priceMinor: 6000, giftCard: { amountMinor: 2500 } };
    expect([cardAsk(held), cardTaken(held), giftTaken(held), balanceDue(held)]).toEqual([3500, 0, 0, 6000]);
    const paid = { ...held, paid: true };
    expect([bookedCardTaken(paid), cardTaken(paid), giftTaken(paid), moneyTaken(paid), balanceDue(paid)]).toEqual([3500, 3500, 2500, 6000, 0]);
    // Cancelled: the card refund and the gift card's part put back both come off what is kept.
    expect(moneyKept({ ...paid, refund: { amountMinor: 3500 }, giftCard: { amountMinor: 2500, returned: true } })).toBe(0);
    expect(moneyKept({ ...paid, refund: { amountMinor: 3500 } })).toBe(2500);
  });

  it("pays part of a deposit, and the rest stays due at the visit", async () => {
    const { balanceDue, cardAsk, cardTaken, giftTaken } = await import("./bookingTimes");
    const dep = { payment: "deposit", priceMinor: 10000, depositMinor: 3000, depositPaid: true, giftCard: { amountMinor: 3000 } };
    expect([cardAsk(dep), cardTaken(dep), giftTaken(dep), balanceDue(dep)]).toEqual([0, 0, 3000, 7000]);
  });

  it("never leaves the card page a sliver below the smallest card payment", async () => {
    const { giftCardPart } = await import("./bookingTimes");
    expect(giftCardPart(4000, 10000)).toBe(4000);
    expect(giftCardPart(4000, 1500)).toBe(1500);
    expect(giftCardPart(4000, 3980)).toBe(3950);
    expect(giftCardPart(40, 10000)).toBe(40);
    expect(giftCardPart(4000, 0)).toBe(0);
  });
});

describe("packs of visits", () => {
  it("keeps a pack only on a priced service, with two visits or more and a card-sized price", async () => {
    const { cleanService, offersPack } = await import("./bookingTimes");
    const base = { name: "Lesson", minutes: 60, payment: "full", priceMinor: 5000 };
    const pack = cleanService({ ...base, packVisits: 5, packPriceMinor: 22500, packDays: 180 });
    expect(pack).toMatchObject({ packVisits: 5, packPriceMinor: 22500, packDays: 180 });
    expect(offersPack(pack as never)).toBe(true);
    expect(cleanService({ ...base, packVisits: 1, packPriceMinor: 5000 })).toEqual({ problem: "A pack has at least 2 visits." });
    expect(cleanService({ ...base, packVisits: 5, packPriceMinor: 20 })).toEqual({ problem: "Say what the pack costs: at least 0.50." });
    expect(cleanService({ ...base, payment: "free", packVisits: 5, packPriceMinor: 5000 })).toMatchObject({ packVisits: 0, packPriceMinor: 0 });
    expect(cleanService(base)).toMatchObject({ packVisits: 0, packPriceMinor: 0, packDays: 0 });
    expect(offersPack(cleanService(base) as never)).toBe(false);
  });

  it("counts what is left and says why a pack can't book", async () => {
    const { packLeft, packProblem, packEndsOn } = await import("./bookingTimes");
    const pack = { status: "active", serviceId: "s1", visits: 3, expiresOn: "2026-12-31", uses: [{ bookingId: "a" }, { bookingId: "b", returned: true }] };
    expect(packLeft(pack)).toBe(2);
    expect(packProblem(pack, "s1", "2026-12-31")).toBeNull();
    expect(packProblem(pack, "s1", "2027-01-01")).toBe("expired");
    expect(packProblem(pack, "s2", "2026-12-01")).toBe("other_service");
    expect(packProblem({ ...pack, status: "held" }, "s1", "2026-12-01")).toBe("not_paid");
    expect(packProblem({ ...pack, status: "closed" }, "s1", "2026-12-01")).toBe("closed");
    expect(packProblem({ ...pack, uses: [{ bookingId: "a" }, { bookingId: "b" }, { bookingId: "c" }] }, "s1", "2026-12-01")).toBe("used_up");
    expect(packProblem(null, "s1", "2026-12-01")).toBe("not_found");
    expect(packEndsOn("2026-11-16", 30)).toBe("2026-12-16");
    expect(packEndsOn("2026-11-16", 0)).toBeNull();
  });

  it("a booking made with a pack has nothing to pay", async () => {
    const { balanceDue, cardAsk, moneyTaken, restPayable } = await import("./bookingTimes");
    const b = { payment: "pack", priceMinor: 0, status: "confirmed" };
    expect([balanceDue(b), cardAsk(b), moneyTaken(b), restPayable(b)]).toEqual([0, 0, 0, false]);
  });
});

describe("pickup times", () => {
  const zone = "America/Toronto";
  // Monday 2026-11-23, 08:00 in Toronto. Default hours: Monday to Friday, ten to five.
  const now = zonedTime("2026-11-23", "08:00", zone);
  const settings = cleanBookingSettings({ pickupTimes: true, pickupSlotMinutes: 60, pickupPerSlot: 2, pickupReadyHours: 3 });

  it("cleans the pickup settings and keeps them off by default", () => {
    expect(cleanBookingSettings({}).pickupTimes).toBe(false);
    const odd = cleanBookingSettings({ pickupTimes: "yes", pickupSlotMinutes: 20, pickupPerSlot: 99, pickupReadyHours: -4 });
    expect(odd).toMatchObject({ pickupTimes: false, pickupSlotMinutes: 30, pickupPerSlot: MAX_PICKUP_PER_SLOT, pickupReadyHours: 0 });
  });

  it("offers slots inside opening hours, after the ready time, for two weeks", () => {
    const slots = pickupSlots({ settings, zone, nowMs: now });
    // Ready from 11:00; hourly slots ending by 17:00 → 11, 12, 13, 14, 15, 16.
    expect(slots["2026-11-23"]).toEqual(["11:00", "12:00", "13:00", "14:00", "15:00", "16:00"].map((t) => zonedTime("2026-11-23", t, zone)));
    expect(slots["2026-11-28"]).toBeUndefined(); // Saturday, closed
    expect(Object.keys(slots).every((d) => d <= addDays("2026-11-23", PICKUP_DAYS_AHEAD - 1))).toBe(true);
    expect(Object.keys(slots)).toHaveLength(10);
  });

  it("drops full slots and days off", () => {
    const eleven = zonedTime("2026-11-23", "11:00", zone);
    const slots = pickupSlots({ settings: { ...settings, daysOff: ["2026-11-24"] }, zone, nowMs: now, taken: { [String(eleven)]: 2 } });
    expect(slots["2026-11-23"][0]).toBe(zonedTime("2026-11-23", "12:00", zone));
    expect(slots["2026-11-24"]).toBeUndefined();
  });

  it("explains why a time can't be taken", () => {
    const at = (day: string, t: string) => zonedTime(day, t, zone);
    expect(pickupTimeProblem({ settings, zone, nowMs: now, start: at("2026-11-23", "12:00") })).toBeNull();
    expect(pickupTimeProblem({ settings, zone, nowMs: now, start: at("2026-11-23", "12:30") })).toBe("closed");
    expect(pickupTimeProblem({ settings, zone, nowMs: now, start: at("2026-11-28", "12:00") })).toBe("closed");
    expect(pickupTimeProblem({ settings, zone, nowMs: now, start: at("2026-11-23", "10:00") })).toBe("too_soon");
    expect(pickupTimeProblem({ settings, zone, nowMs: now, start: at("2026-12-09", "12:00") })).toBe("too_far");
    expect(pickupTimeProblem({ settings, zone, nowMs: now, start: at("2026-11-23", "12:00"), taken: 2 })).toBe("full");
    expect(pickupTimeProblem({ settings, zone, nowMs: now, start: NaN })).toBe("closed");
  });
});

describe("check-in codes", () => {
  it("typed or scanned loosely, kept only when it is one of ours", () => {
    expect(cleanCheckInCode("k7qm 2xpa")).toBe("K7QM-2XPA");
    expect(cleanCheckInCode(" K7QM-2XPA\n")).toBe("K7QM-2XPA");
    expect(cleanCheckInCode("K7QM-2XP0")).toBe("");
    expect(cleanCheckInCode("K7QM-2XPAB")).toBe("");
    expect(cleanCheckInCode(null)).toBe("");
    expect(checkInCodeFrom([0, 1, 2, 3, 31, 32, 255, 64])).toBe(`ABCD-${CHECK_IN_ALPHABET[31]}A${CHECK_IN_ALPHABET[31]}A`);
    expect(cleanCheckInCode(checkInCodeFrom([9, 8, 7, 6, 5, 4, 3, 2]))).toBe(checkInCodeFrom([9, 8, 7, 6, 5, 4, 3, 2]));
  });
});

describe("staff and rooms", () => {
  const cut = { id: "cut", minutes: 60, gapAfter: 0 };
  const facial = { id: "facial", minutes: 60, gapAfter: 0, roomId: "r1" };
  const team = cleanBookingSettings({
    ...settings,
    rooms: [{ id: "r1", name: "Quiet room" }],
    staff: [
      { id: "ana", name: "Ana" },
      { id: "ben", name: "Ben", serviceIds: ["cut"], ownHours: true, hours: [[], [{ start: "12:00", end: "15:00" }], [], [], [], [], []], daysOff: ["2026-11-23"] },
    ],
  });
  const withTeam = { ...team, live: true, minNoticeHours: 0 };
  const ten = at("2026-11-16", "10:00");
  const one = at("2026-11-16", "13:00");
  const free = (args: Partial<Parameters<typeof freeTimes>[0]> & { service: typeof cut }) =>
    freeTimes({ settings: withTeam, busy: [], day: "2026-11-16", zone: ZONE, nowMs: NOW, ...args }).map(hhmm);

  it("books as one calendar when nobody is listed, with the same times as before", () => {
    const before = freeTimes({ service: cut, settings, busy: [], day: "2026-11-16", zone: ZONE, nowMs: NOW });
    expect(freeTimes({ service: cut, settings: { ...settings, staff: [], rooms: [] }, busy: [], day: "2026-11-16", zone: ZONE, nowMs: NOW })).toEqual(before);
    expect(whoIsFree({ service: cut, settings, busy: [], start: ten, zone: ZONE, nowMs: NOW })).toBe("");
    // Someone listed but switched off counts as nobody.
    const off = { ...withTeam, staff: withTeam.staff.map((p) => ({ ...p, active: false })) };
    expect(freeTimes({ service: cut, settings: off, busy: [], day: "2026-11-16", zone: ZONE, nowMs: NOW })).toEqual(before);
  });

  it("follows each person's own hours and days off", () => {
    expect(free({ service: cut, staffId: "ben" })).toEqual(["12:00", "12:30", "13:00", "13:30", "14:00"]);
    expect(free({ service: cut, staffId: "ana" })[0]).toBe("10:00");
    expect(freeTimes({ service: cut, settings: withTeam, busy: [], day: "2026-11-23", zone: ZONE, nowMs: NOW, staffId: "ben" })).toEqual([]);
    expect(freeTimes({ service: cut, settings: withTeam, busy: [], day: "2026-11-23", zone: ZONE, nowMs: NOW }).length).toBeGreaterThan(0);
  });

  it("never offers someone who doesn't do the service", () => {
    expect(staffFor(withTeam, "facial").map((p) => p.id)).toEqual(["ana"]);
    expect(free({ service: facial, staffId: "ben" })).toEqual([]);
    expect(whoIsFree({ service: facial, settings: withTeam, busy: [], start: one, zone: ZONE, nowMs: NOW, staffId: "ben" })).toBeNull();
  });

  it("skips a busy person and offers the other", () => {
    const anaBusy = [{ start: one, end: one + 3_600_000, serviceId: "cut", staffId: "ana" }];
    expect(whoIsFree({ service: cut, settings: withTeam, busy: anaBusy, start: one, zone: ZONE, nowMs: NOW })).toBe("ben");
    expect(whoIsFree({ service: cut, settings: withTeam, busy: anaBusy, start: one, zone: ZONE, nowMs: NOW, staffId: "ana" })).toBeNull();
    expect(free({ service: cut, busy: anaBusy })).toContain("13:00");
    expect(free({ service: cut, busy: anaBusy, staffId: "ana" })).not.toContain("13:00");
  });

  it("lets only one booking use a room at a time, whoever does it", () => {
    const twoRoomPeople = cleanBookingSettings({ ...withTeam, staff: [{ id: "ana", name: "Ana" }, { id: "cy", name: "Cy" }] });
    const s2 = { ...twoRoomPeople, live: true, minNoticeHours: 0 };
    const roomTaken = [{ start: ten, end: ten + 3_600_000, serviceId: "facial", staffId: "ana", roomId: "r1" }];
    expect(whoIsFree({ service: facial, settings: s2, busy: roomTaken, start: ten, zone: ZONE, nowMs: NOW })).toBeNull();
    // A haircut needs no room, so Cy is still free then.
    expect(whoIsFree({ service: cut, settings: s2, busy: roomTaken, start: ten, zone: ZONE, nowMs: NOW })).toBe("cy");
  });

  it("shares a class only with the same person, and sends 'anyone' to the class already running", () => {
    const yoga = { id: "yoga", minutes: 60, gapAfter: 0, places: 3, classTimes: [{ weekday: 1, time: "11:00" }] };
    const eleven = at("2026-11-16", "11:00");
    const s2 = { ...cleanBookingSettings({ ...withTeam, staff: [{ id: "ana", name: "Ana" }, { id: "cy", name: "Cy" }] }), live: true, minNoticeHours: 0 };
    const cyTeaching = [{ start: eleven, end: eleven + 3_600_000, serviceId: "yoga", staffId: "cy" }];
    expect(placesLeft(eleven, yoga, cyTeaching, "cy")).toBe(2);
    expect(placesLeft(eleven, yoga, cyTeaching, "ana")).toBe(3);
    expect(whoIsFree({ service: yoga, settings: s2, busy: cyTeaching, start: eleven, zone: ZONE, nowMs: NOW })).toBe("cy");
  });

  it("lets an older booking with no person block everyone", () => {
    const old = [{ start: ten, end: ten + 3_600_000, serviceId: "cut" }];
    expect(whoIsFree({ service: cut, settings: withTeam, busy: old, start: ten, zone: ZONE, nowMs: NOW })).toBeNull();
    expect(free({ service: cut, busy: old })).not.toContain("10:00");
  });

  it("picks fairly: the person with fewer bookings that day, then list order", () => {
    expect(whoIsFree({ service: cut, settings: withTeam, busy: [], start: one, zone: ZONE, nowMs: NOW })).toBe("ana");
    const anaMorning = [{ start: ten, end: ten + 3_600_000, serviceId: "cut", staffId: "ana" }];
    expect(whoIsFree({ service: cut, settings: withTeam, busy: anaMorning, start: one, zone: ZONE, nowMs: NOW })).toBe("ben");
    expect(isFreeTime({ service: cut, settings: withTeam, busy: anaMorning, start: one, zone: ZONE, nowMs: NOW })).toBe(true);
  });

  it("cleans the people and rooms the owner typed", () => {
    const people = cleanStaff([{ name: " Ana " }, { name: "" }, { id: "ana", name: "Ana two", email: "nope", serviceIds: ["cut", "bad id!", "cut"] }, "x"]);
    expect(people.map((p) => [p.id, p.name, p.active, p.email])).toEqual([["p1", "Ana", true, ""], ["ana", "Ana two", true, ""]]);
    expect(people[1].serviceIds).toEqual(["cut"]);
    expect(cleanStaff(Array.from({ length: 30 }, (_, i) => ({ name: `P${i}` })))).toHaveLength(MAX_STAFF);
    expect(cleanRooms([{ id: "r", name: "A" }, { id: "r", name: "B" }, { name: "" }]).map((r) => r.id)).toEqual(["r", "rx"]);
    expect(cleanRooms(Array.from({ length: 12 }, (_, i) => ({ name: `R${i}` })))).toHaveLength(MAX_ROOMS);
    expect(cleanService({ name: "Facial", minutes: 60, roomId: "r 1!" })).toMatchObject({ roomId: "r1" });
    expect(cleanBookingSettings({})).toMatchObject({ staff: [], rooms: [] });
  });

  it("keeps a commission share from 0.5 to 100 in half steps, and drops anything else", () => {
    expect([40, "12.5", 0.2, 0.3, 101, 33.3, -5, "", "abc", null, NaN].map(commissionOf)).toEqual([40, 12.5, 0, 0.5, 100, 33.5, 0, 0, 0, 0, 0]);
    const [a, b] = cleanStaff([{ name: "Ana", commissionPercent: 40 }, { name: "Ben", commissionPercent: 0 }]);
    expect(a.commissionPercent).toBe(40);
    expect("commissionPercent" in b).toBe(false);
  });
});

describe("rebook reminders", () => {
  const visit = { status: "confirmed", start: "2026-11-18T20:00:00.000Z", customer: { email: "ada@example.com" } };
  const at = (days: number) => Date.parse(visit.start) + days * 86_400_000;
  it("are due from the set number of weeks after the visit, for two weeks", () => {
    expect(rebookDue(visit, { rebookWeeks: 6 }, at(41))).toBe(false);
    expect(rebookDue(visit, { rebookWeeks: 6 }, at(42))).toBe(true);
    expect(rebookDue(visit, { rebookWeeks: 6 }, at(55))).toBe(true);
    expect(rebookDue(visit, { rebookWeeks: 6 }, at(56))).toBe(false);
  });
  it("never for a service without them, a missed or cancelled visit, no email, or one already sent", () => {
    expect(rebookDue(visit, { rebookWeeks: 0 }, at(43))).toBe(false);
    expect(rebookDue(visit, {}, at(43))).toBe(false);
    expect(rebookDue({ ...visit, noShow: true }, { rebookWeeks: 6 }, at(43))).toBe(false);
    expect(rebookDue({ ...visit, status: "cancelled" }, { rebookWeeks: 6 }, at(43))).toBe(false);
    expect(rebookDue({ ...visit, customer: {} }, { rebookWeeks: 6 }, at(43))).toBe(false);
    expect(rebookDue({ ...visit, rebookSentAt: "2026-12-30T00:00:00Z" }, { rebookWeeks: 6 }, at(43))).toBe(false);
  });
  it("a service keeps 0 to 52 weeks", () => {
    const base = { name: "Cut", minutes: 30, payment: "atShop", priceMinor: 6000 };
    expect((cleanService({ ...base, rebookWeeks: 6 }) as { rebookWeeks: number }).rebookWeeks).toBe(6);
    expect((cleanService({ ...base, rebookWeeks: 99 }) as { rebookWeeks: number }).rebookWeeks).toBe(52);
    expect((cleanService(base) as { rebookWeeks: number }).rebookWeeks).toBe(0);
  });
});

describe("a class's own starts on a day (the Classes timetable)", () => {
  const cls = { places: 8, classTimes: [{ weekday: 1, time: "18:00" }, { weekday: 1, time: "09:30" }, { weekday: 4, time: "18:00" }] };
  it("lists that weekday's class times, earliest first, booked or not", () => {
    expect(classStartsOn("2026-11-16", cls, ZONE).map(hhmm)).toEqual(["09:30", "18:00"]);
    expect(classStartsOn("2026-11-19", cls, ZONE).map(hhmm)).toEqual(["18:00"]);
    expect(classStartsOn("2026-11-17", cls, ZONE)).toEqual([]);
  });
  it("keeps 18:00 at 18:00 on the shop's clock either side of a clock change", () => {
    // Clocks go back on Sunday 1 November 2026 and forward on Sunday 14 March 2027 in Toronto.
    expect(new Date(classStartsOn("2026-10-26", cls, ZONE)[1]).toISOString()).toBe("2026-10-26T22:00:00.000Z");
    expect(new Date(classStartsOn("2026-11-02", cls, ZONE)[1]).toISOString()).toBe("2026-11-02T23:00:00.000Z");
    expect(new Date(classStartsOn("2027-03-15", cls, ZONE)[1]).toISOString()).toBe("2027-03-15T22:00:00.000Z");
  });
  it("has nothing for a one-customer service, a class with no weekly times or a day that isn't one", () => {
    expect(classStartsOn("2026-11-16", { places: 1, classTimes: cls.classTimes }, ZONE)).toEqual([]);
    expect(classStartsOn("2026-11-16", { places: 8, classTimes: [] }, ZONE)).toEqual([]);
    expect(classStartsOn("16 Nov", cls, ZONE)).toEqual([]);
  });
});

describe("courses (one sign-up for every date)", () => {
  // Top-level await would make the generated copy awkward; the names are read from the module in each test.
  const load = () => import("./bookingTimes");
  const course = { id: "wheel", minutes: 120, gapAfter: 0, places: 2, courseDates: ["2026-11-28T18:00", "2026-12-05T18:00", "2026-12-12T18:00"] };
  it("cleans the dates: real moments, no repeats, earliest first, and a course needs two dates and two places", async () => {
    const { cleanCourseDates, isCourse } = await load();
    expect(cleanCourseDates(["2026-12-05T18:00", "2026-11-28T18:00:00", "2026-11-28T18:00", "2026-02-30T10:00", "T18:00", "2026-11-28T25:00", 7])).toEqual(["2026-11-28T18:00", "2026-12-05T18:00"]);
    expect(isCourse(course)).toBe(true);
    expect(isCourse({ places: 1, courseDates: course.courseDates })).toBe(false);
    expect(isCourse({ places: 4, courseDates: ["2026-11-28T18:00"] })).toBe(false);
    expect(cleanService({ name: "Course", minutes: 60, places: 4, courseDates: ["2026-11-28T18:00", ""] })).toEqual({ problem: expect.stringContaining("at least 2 dates") });
    expect(cleanService({ name: "Class", minutes: 60, places: 4, courseDates: [] })).not.toHaveProperty("courseDates");
  });
  it("is offered on its first date only, outside the opening hours and past the last bookable day", async () => {
    const { courseStarts } = await load();
    const near = { ...settings, maxDaysAhead: 3 };
    expect(courseStarts(course, ZONE)).toEqual([at("2026-11-28", "18:00"), at("2026-12-05", "18:00"), at("2026-12-12", "18:00")]);
    expect(freeTimes({ service: course, settings: near, busy: [], day: "2026-11-28", zone: ZONE, nowMs: NOW })).toEqual([at("2026-11-28", "18:00")]);
    expect(freeTimes({ service: course, settings: near, busy: [], day: "2026-12-05", zone: ZONE, nowMs: NOW })).toEqual([]);
    // Once the first date has started there is nothing to sign up for.
    expect(freeTimes({ service: course, settings: near, busy: [], day: "2026-11-28", zone: ZONE, nowMs: at("2026-11-28", "18:01") })).toEqual([]);
  });
  it("has as many places left as its fullest date", async () => {
    const { coursePlacesLeft } = await load();
    const taken = (day: string) => ({ start: at(day, "18:00"), end: at(day, "20:00"), serviceId: "wheel" });
    expect(coursePlacesLeft(course, settings, [], ZONE)).toBe(2);
    expect(coursePlacesLeft(course, settings, [taken("2026-12-05")], ZONE)).toBe(1);
    expect(coursePlacesLeft(course, settings, [taken("2026-12-05"), taken("2026-12-05"), taken("2026-11-28")], ZONE)).toBe(0);
    // Something else in a date's way takes every place.
    expect(coursePlacesLeft(course, settings, [{ start: at("2026-12-12", "19:00"), end: at("2026-12-12", "19:30"), serviceId: "visit" }], ZONE)).toBe(0);
  });
});

describe("joining a course late", () => {
  const test = it;
  const course = { places: 4, priceMinor: 10000, depositMinor: 5000, courseDates: ["2026-11-02T18:00", "2026-11-09T18:00", "2026-11-16T18:00", "2026-11-23T18:00"] };
  const Z = "America/Toronto";
  const t = (d: string) => zonedTime(d, "19:00", Z);
  test("before it starts the whole course comes back as it is", () => {
    expect(joinableCourse(course, Z, t("2026-11-01"))).toBe(course);
  });
  test("once it starts only a course that lets people join late can be joined, for the dates left at their share", () => {
    expect(joinableCourse(course, Z, t("2026-11-02"))).toBeNull();
    const late = joinableCourse({ ...course, lateJoin: true }, Z, t("2026-11-09"));
    expect(late).toMatchObject({ courseDates: ["2026-11-16T18:00", "2026-11-23T18:00"], priceMinor: 5000, depositMinor: 5000, joining: { missed: 2, of: 4, fullPriceMinor: 10000 } });
    // Fewer than two dates left: closed.
    expect(joinableCourse({ ...course, lateJoin: true }, Z, t("2026-11-16"))).toBeNull();
  });
  test("anything that isn't a course comes back as it is", () => {
    const visit = { places: 1, priceMinor: 100 };
    expect(joinableCourse(visit, Z, 0)).toBe(visit);
  });
});

describe("a class's minimum number to run", () => {
  const HOUR = 3_600_000;
  const start = Date.parse("2026-11-18T19:00:00Z");
  it("is due from its decide time until it starts, and never without a minimum", () => {
    const klass = { minPlaces: 3, decideHours: 24 };
    expect(runDecisionDue(start, klass, start - 25 * HOUR)).toBe(false);
    expect(runDecisionDue(start, klass, start - 24 * HOUR)).toBe(true);
    expect(runDecisionDue(start, klass, start - 1)).toBe(true);
    expect(runDecisionDue(start, klass, start)).toBe(false);
    expect(runDecisionDue(start, {}, start - HOUR)).toBe(false);
  });
  it("a closed class time has no places, and holds up nothing else", () => {
    const klass = { id: "draw", minutes: 60, gapAfter: 0, places: 6 };
    const busy = [{ start, end: start + HOUR, serviceId: "draw", closed: true }];
    expect(placesLeft(start, klass, busy)).toBe(0);
    expect(placesLeft(start + 24 * HOUR, klass, busy)).toBe(6);
    expect(placesLeft(start, { id: "visit", minutes: 30, gapAfter: 0, places: 1 }, busy)).toBe(1);
  });
});

describe("a class pass", () => {
  const pass = { serviceId: "drawing", anyClass: true, status: "active", visits: 5, uses: [], expiresOn: null };
  it("books any weekly class, and only its own service otherwise", () => {
    expect(packProblem(pass, "yoga", "2026-11-18", true)).toBeNull();
    expect(packProblem(pass, "yoga", "2026-11-18", false)).toBe("other_service");
    expect(packProblem({ ...pass, anyClass: false }, "yoga", "2026-11-18", true)).toBe("other_service");
  });
});

describe("blocked time (plan 4, 1.3)", () => {
  const lunch = { id: "lunch", title: "Lunch", staffId: "", day: "2026-11-16", start: "12:00", end: "13:00", weekly: true, until: "" };
  it("keeps only sound blocks", () => {
    expect(cleanBlocks([lunch])).toEqual([lunch]);
    expect(cleanBlocks([{ ...lunch, start: "13:00", end: "12:00" }])).toEqual([]);
    expect(cleanBlocks([{ ...lunch, day: "16 Nov" }])).toEqual([]);
    expect(cleanBlocks([{ ...lunch, start: "00:00", end: "24:00" }])[0].end).toBe("24:00");
    expect(cleanBlocks([{ ...lunch, weekly: false, until: "2026-12-01" }])[0].until).toBe("");
    // One-off blocks in the past fall away; weekly ones with no end stay.
    expect(cleanBlocks([{ ...lunch, weekly: false }], "2026-11-17")).toEqual([]);
    expect(cleanBlocks([lunch], "2027-01-01")).toHaveLength(1);
    expect(cleanBlocks([{ ...lunch, until: "2026-11-30" }], "2027-01-01")).toEqual([]);
    expect(cleanBlocks(Array.from({ length: MAX_BLOCKS + 5 }, (_, i) => ({ ...lunch, id: `b${i}` })))).toHaveLength(MAX_BLOCKS);
    expect(cleanBlocks([lunch, lunch])).toHaveLength(1);
  });
  it("repeats a weekly block on its weekday until its end", () => {
    const until = { ...lunch, until: "2026-11-30" };
    expect(blockOn(until, "2026-11-23")).toBe(true);
    expect(blockOn(until, "2026-11-24")).toBe(false);
    expect(blockOn(until, "2026-12-07")).toBe(false);
    expect(blockOn(until, "2026-11-09")).toBe(false);
    expect(blockOn({ ...lunch, weekly: false }, "2026-11-23")).toBe(false);
  });
  it("takes blocked time out of the free times, a person's block only for them", () => {
    const free = (blocks: unknown[], staffId?: string, s: typeof settings = settings) =>
      freeTimes({ service, settings: { ...s, blocks: cleanBlocks(blocks) }, busy: [], day: "2026-11-23", zone: ZONE, nowMs: NOW, staffId }).map(hhmm);
    const open = free([]);
    expect(free([lunch])).toEqual(open.filter((t) => !["11:30", "12:00", "12:30"].includes(t)));
    expect(free([{ ...lunch, start: "00:00", end: "24:00" }])).toEqual([]);
    const team = { ...cleanBookingSettings({ ...settings, staff: [{ id: "ana", name: "Ana" }, { id: "ben", name: "Ben" }] }), live: true, minNoticeHours: 0 };
    const anaOff = [{ ...lunch, staffId: "ana", start: "00:00", end: "24:00" }];
    expect(free(anaOff, "ana", team)).toEqual([]);
    expect(free(anaOff, "ben", team)).toEqual(open);
    expect(free(anaOff, undefined, team)).toEqual(open);
    expect(blockedBusy([lunch], "2026-11-23", ZONE)).toEqual([{ start: at("2026-11-23", "12:00"), end: at("2026-11-23", "13:00") }]);
  });
  it("survives the settings clean", () => {
    expect(cleanBookingSettings({ ...settings, blocks: [lunch] }).blocks).toEqual([lunch]);
    expect(cleanBookingSettings(settings).blocks).toBeUndefined();
  });
});

describe("equipment counts (plan 4, 1.9)", () => {
  const facial = { id: "facial", minutes: 60, gapAfter: 0, roomId: "r1" };
  const ten = at("2026-11-16", "10:00");
  const hour = 3_600_000;
  const people = [{ id: "ana", name: "Ana" }, { id: "ben", name: "Ben" }, { id: "cy", name: "Cy" }];
  const shop = (units?: number) => ({ ...cleanBookingSettings({ ...settings, rooms: [{ id: "r1", name: "Tables", units }], staff: people }), live: true, minNoticeHours: 0 });
  const using = (who: string, start = ten) => ({ start, end: start + hour, serviceId: "facial", staffId: who, roomId: "r1" });

  it("keeps a count from 2 to 20 and reads anything else as one", () => {
    expect(cleanRooms([{ name: "A", units: 3 }, { name: "B", units: 1 }, { name: "C", units: 99 }, { name: "D", units: "x" }]).map((r) => r.units))
      .toEqual([3, undefined, MAX_ROOM_UNITS, undefined]);
    expect(roomUnits({ rooms: [{ id: "r1", name: "A", units: 3 }] }, "r1")).toBe(3);
    expect(roomUnits({ rooms: [{ id: "r1", name: "A" }] }, "r1")).toBe(1);
    expect(roomUnits({}, undefined)).toBe(1);
    expect(roomUnitsText(1)).toBe("One at a time");
    expect(roomUnitsText(3)).toBe("3 at once");
  });

  it("lets a room that takes two hold two bookings by different people, and refuses a third", () => {
    const s2 = shop(2);
    expect(whoIsFree({ service: facial, settings: s2, busy: [using("ana")], start: ten, zone: ZONE, nowMs: NOW })).toBe("ben");
    expect(whoIsFree({ service: facial, settings: s2, busy: [using("ana"), using("ben")], start: ten, zone: ZONE, nowMs: NOW })).toBeNull();
    // Half an hour later it is still full; once the first ends, there is room again.
    expect(whoIsFree({ service: facial, settings: s2, busy: [using("ana"), using("ben")], start: ten + hour / 2, zone: ZONE, nowMs: NOW })).toBeNull();
    expect(whoIsFree({ service: facial, settings: s2, busy: [using("ana"), using("ben", ten + hour)], start: ten + hour / 2, zone: ZONE, nowMs: NOW })).toBe("cy");
    // Two that never overlap each other leave room for a third between them.
    expect(whoIsFree({ service: facial, settings: s2, busy: [using("ana"), using("ben", ten + 2 * hour)], start: ten + hour, zone: ZONE, nowMs: NOW })).not.toBeNull();
  });

  it("behaves as before for a room with no count", () => {
    expect(whoIsFree({ service: facial, settings: shop(), busy: [using("ana")], start: ten, zone: ZONE, nowMs: NOW })).toBeNull();
    expect(freeTimes({ service: facial, settings: shop(), busy: [using("ana")], day: "2026-11-16", zone: ZONE, nowMs: NOW }).map(hhmm)).not.toContain("10:00");
    expect(freeTimes({ service: facial, settings: shop(3), busy: [using("ana"), using("ben")], day: "2026-11-16", zone: ZONE, nowMs: NOW }).map(hhmm)).toContain("10:00");
  });

  it("still keeps one person to one booking, whatever the room takes", () => {
    expect(whoIsFree({ service: facial, settings: shop(3), busy: [using("ana")], start: ten, zone: ZONE, nowMs: NOW, staffId: "ana" })).toBeNull();
  });

  it("counts a class's places against the room too", () => {
    const yoga = { id: "yoga", minutes: 60, gapAfter: 0, places: 5, roomId: "r1" };
    const other = { start: ten, end: ten + hour, serviceId: "facial", staffId: "cy", roomId: "r1" };
    expect(classPlacesLeft(ten, yoga, shop(), [other])).toBe(0);
    expect(classPlacesLeft(ten, yoga, shop(2), [other])).toBe(5);
  });
});

describe("daily limit (plan 4, 1.8)", () => {
  const day = "2026-11-23";
  const two = [
    { start: at(day, "10:00"), end: at(day, "11:00") },
    { start: at(day, "12:00"), end: at(day, "13:00") },
    { start: at(day, "14:00"), end: at(day, "15:00"), away: true },
    { start: at(day, "15:00"), end: at(day, "16:00"), closed: true, serviceId: "yoga" },
    { start: at("2026-11-24", "10:00"), end: at("2026-11-24", "11:00") },
  ];
  it("keeps only a listed limit", () => {
    expect(cleanBookingSettings({ dailyCap: 4 }).dailyCap).toBe(4);
    expect(cleanBookingSettings({ dailyCap: 7 })).not.toHaveProperty("dailyCap");
    expect(cleanBookingSettings({ dailyCap: 0 })).not.toHaveProperty("dailyCap");
  });
  it("counts the day's bookings only, never a person's own busy time or a closed class", () => {
    expect(bookingsOnDay(two, day, ZONE)).toBe(2);
  });
  it("stops online times once the day has that many, and never stops the owner", () => {
    const capped = { ...settings, dailyCap: 2 };
    expect(freeTimes({ service, settings: capped, busy: two, day, zone: ZONE, nowMs: NOW })).toEqual([]);
    expect(freeTimes({ service, settings: { ...settings, dailyCap: 3 }, busy: two, day, zone: ZONE, nowMs: NOW }).length).toBeGreaterThan(0);
    expect(freeTimes({ service, settings: capped, busy: two, day: "2026-11-24", zone: ZONE, nowMs: NOW }).length).toBeGreaterThan(0);
    expect(freeTimes({ service, settings: ownerBookingSettings(capped), busy: two, day, zone: ZONE, nowMs: NOW }).length).toBeGreaterThan(0);
  });
});

describe("holiday hours (plan 4, 1.7)", () => {
  // Monday 2026-11-23 is normally 10:00 to 17:00.
  const short = { id: "h1", label: "Short week", from: "2026-11-23", to: "2026-11-27", hours: [{ start: "12:00", end: "14:00" }] };
  const closed = { id: "h2", label: "", from: "2026-11-25", to: "2026-11-25", hours: [] };
  it("cleans the stretches: real days in order, not too long, ended ones dropped when asked", () => {
    const list = cleanSpecialHours([
      closed, short,
      { from: "2026-12-10", to: "2026-12-01" },
      { from: "2026-12-01", to: addDays("2026-12-01", MAX_SPECIAL_DAYS) },
      { from: "2026-12-24", hours: [{ start: "15:00", end: "11:00" }] },
      { from: "nope" },
    ]);
    expect(list.map((h) => h.from)).toEqual(["2026-11-23", "2026-11-25", "2026-12-24"]);
    expect(list[2]).toMatchObject({ to: "2026-12-24", hours: [] });
    expect(cleanSpecialHours([short, closed], "2026-11-26").map((h) => h.id)).toEqual(["h1"]);
    expect(cleanBookingSettings({ specialHours: [short] }).specialHours).toHaveLength(1);
    expect(cleanBookingSettings({})).not.toHaveProperty("specialHours");
  });
  it("replaces the weekly hours on its days, the later-starting stretch first", () => {
    const s = { ...settings, specialHours: [short, closed] };
    expect(hoursOnDay(s, "2026-11-23")).toEqual(short.hours);
    expect(hoursOnDay(s, "2026-11-25")).toEqual([]);
    expect(specialOn(s.specialHours, "2026-11-25")?.id).toBe("h2");
    expect(hoursOnDay(s, "2026-11-30")).toEqual(settings.hours[1]);
    expect(freeTimes({ service, settings: s, busy: [], day: "2026-11-23", zone: ZONE, nowMs: NOW }).map(hhmm)).toEqual(["12:00", "12:30", "13:00"]);
    expect(freeTimes({ service, settings: s, busy: [], day: "2026-11-25", zone: ZONE, nowMs: NOW })).toEqual([]);
    // A Sunday that's normally closed can open for the stretch.
    const sunday = { ...settings, specialHours: [{ id: "s", label: "", from: "2026-11-29", to: "2026-11-29", hours: [{ start: "11:00", end: "13:00" }] }] };
    expect(freeTimes({ service, settings: sunday, busy: [], day: "2026-11-29", zone: ZONE, nowMs: NOW }).map(hhmm)).toEqual(["11:00", "11:30", "12:00"]);
  });
  it("goes for one person too: theirs first, then their own week, else the shop's holiday hours", () => {
    const team = cleanBookingSettings({ ...settings, live: true, minNoticeHours: 0, specialHours: [short], staff: [
      { id: "ana", name: "Ana" },
      { id: "ben", name: "Ben", specialHours: [{ id: "b", from: "2026-11-23", to: "2026-11-23", hours: [{ start: "16:00", end: "18:00" }] }] },
      { id: "cy", name: "Cy", ownHours: true, hours: settings.hours },
    ] });
    const [ana, ben, cy] = team.staff;
    expect(personHoursOn(team, ana, "2026-11-23")).toEqual(short.hours);
    expect(personHoursOn(team, ben, "2026-11-23")).toEqual([{ start: "16:00", end: "18:00" }]);
    expect(personHoursOn(team, cy, "2026-11-23")).toEqual(settings.hours[1]);
    expect(whoIsFree({ service, settings: team, busy: [], start: at("2026-11-23", "16:00"), zone: ZONE, nowMs: NOW, staffId: "ben" })).toBe("ben");
    expect(whoIsFree({ service, settings: team, busy: [], start: at("2026-11-23", "16:00"), zone: ZONE, nowMs: NOW, staffId: "ana" })).toBeNull();
  });
  it("moves pickup times with the shop's hours", () => {
    const pick = cleanBookingSettings({ pickupTimes: true, pickupSlotMinutes: 60, pickupReadyHours: 0, specialHours: [closed] });
    const slots = pickupSlots({ settings: pick, zone: ZONE, nowMs: NOW });
    expect(slots["2026-11-25"]).toBeUndefined();
    expect(slots["2026-11-24"]).toBeDefined();
  });
});

describe("time before (plan 4, 1.6)", () => {
  const visit = { id: "visit", minutes: 60, gapAfter: 0, gapBefore: 30 };
  const plain = { id: "plain", minutes: 60, gapAfter: 0 };
  const day = "2026-11-23";
  const booked = [{ start: at(day, "11:00"), end: at(day, "12:00"), serviceId: "plain" }];
  it("keeps time before only on one-to-one services, up to two hours", () => {
    const base = { name: "House call", minutes: 60 };
    expect(cleanService({ ...base, gapBefore: 30 })).toMatchObject({ gapBefore: 30 });
    expect(cleanService(base)).not.toHaveProperty("gapBefore");
    expect(cleanService({ ...base, gapBefore: 500 })).toMatchObject({ gapBefore: 120 });
    expect(cleanService({ ...base, places: 6, gapBefore: 30 })).not.toHaveProperty("gapBefore");
  });
  it("needs its own time before free, right up to the start", () => {
    // 12:00 is free, 12:30 too; 11:30 would need 11:00 to 11:30 free first.
    expect(placesLeft(at(day, "12:30"), visit, booked)).toBe(1);
    expect(placesLeft(at(day, "12:00"), visit, booked)).toBe(0);
    expect(placesLeft(at(day, "12:00"), plain, booked)).toBe(1);
  });
  it("keeps others out of the time before a booking already made", () => {
    const withBefore = [{ start: at(day, "10:30"), end: at(day, "12:00"), serviceId: "visit" }];
    expect(placesLeft(at(day, "09:30"), plain, withBefore)).toBe(1);
    expect(placesLeft(at(day, "10:00"), plain, withBefore)).toBe(0);
  });
});

describe("processing time (plan 4, 1.5)", () => {
  const colour = { id: "colour", minutes: 120, gapAfter: 0, processAfter: 30, processMinutes: 45 };
  const trim = { id: "trim", minutes: 30, gapAfter: 0 };
  const day = "2026-11-23";
  const start = at(day, "10:00");
  // Colour booked at 10:00: processing runs 10:30 to 11:15.
  const busy = [{ start, end: start + 120 * 60_000, serviceId: "colour", free: { start: at(day, "10:30"), end: at(day, "11:15") } }];
  it("keeps only processing that fits inside a one-to-one service", () => {
    const base = { name: "Colour", minutes: 120 };
    expect(cleanService({ ...base, processAfter: 30, processMinutes: 45 })).toMatchObject({ processAfter: 30, processMinutes: 45 });
    expect(cleanService(base)).not.toHaveProperty("processMinutes");
    expect(cleanService({ ...base, processAfter: 90, processMinutes: 30 })).toHaveProperty("problem");
    expect(cleanService({ ...base, processAfter: 0, processMinutes: 30 })).toHaveProperty("problem");
    expect(cleanService({ ...base, processAfter: 30, processMinutes: 5 })).toHaveProperty("problem");
    // A class keeps its teacher the whole time.
    expect(cleanService({ ...base, places: 6, processAfter: 30, processMinutes: 45 })).not.toHaveProperty("processMinutes");
  });
  it("works out the stretch, and drops it when the booking is too short for it", () => {
    expect(processingStretch(colour, start)).toEqual({ start: at(day, "10:30"), end: at(day, "11:15") });
    expect(processingStretch({ ...colour, minutes: 70 }, start)).toBeNull();
    expect(processingStretch(trim, start)).toBeNull();
  });
  it("lets a short booking sit wholly inside another's processing, never across its edge", () => {
    expect(placesLeft(at(day, "10:30"), trim, busy)).toBe(1);
    expect(placesLeft(at(day, "10:45"), trim, busy)).toBe(1);
    expect(placesLeft(at(day, "11:00"), trim, busy)).toBe(0);
    expect(placesLeft(at(day, "10:15"), trim, busy)).toBe(0);
    // Its rest after has to fit too.
    expect(placesLeft(at(day, "10:45"), { ...trim, gapAfter: 15 }, busy)).toBe(0);
    // The room stays in use while it processes.
    expect(placesLeft(at(day, "10:30"), { ...trim, roomId: "chair" }, busy.map((b) => ({ ...b, roomId: "chair" })))).toBe(0);
  });
  it("lets a long booking go around a short one already booked in its processing", () => {
    const short = [{ start: at(day, "10:40"), end: at(day, "11:10"), serviceId: "trim" }];
    expect(placesLeft(start, colour, short)).toBe(1);
    expect(placesLeft(at(day, "10:30"), colour, short)).toBe(0);
  });
  it("is the person's own free time: someone else's processing frees nobody else", () => {
    const team = { ...cleanBookingSettings({ ...settings, staff: [{ id: "ana", name: "Ana" }, { id: "ben", name: "Ben" }] }), live: true, minNoticeHours: 0 };
    const anas = busy.map((b) => ({ ...b, staffId: "ana" }));
    expect(whoIsFree({ service: trim, settings: team, busy: anas, start: at(day, "10:30"), zone: ZONE, nowMs: NOW, staffId: "ana" })).toBe("ana");
    expect(freeTimes({ service: trim, settings: { ...settings, step: 15 }, busy, day, zone: ZONE, nowMs: NOW }).map(hhmm)).toEqual(expect.arrayContaining(["10:30", "10:45"]));
    expect(freeTimes({ service: trim, settings: { ...settings, step: 15 }, busy, day, zone: ZONE, nowMs: NOW }).map(hhmm)).not.toContain("11:00");
  });
});

describe("several services in one visit (plan 4, 2.1)", () => {
  const day = "2026-11-16";
  const ten = at(day, "10:00");
  const cut = { id: "cut", minutes: 60, gapAfter: 15, priceMinor: 6000, payment: "full" as const };
  const colour = { id: "colour", minutes: 90, gapAfter: 10, priceMinor: 12000, payment: "deposit" as const, depositMinor: 3000, chargeTax: true };
  const people = [{ id: "ana", name: "Ana", serviceIds: ["cut"] }, { id: "ben", name: "Ben" }];
  const team = { ...cleanBookingSettings({ ...settings, staff: people }), live: true, minNoticeHours: 0 };

  it("lets only one-to-one services join a visit", () => {
    expect(MAX_VISIT_PARTS).toBe(3);
    expect(joinsVisit(cut)).toBe(true);
    expect(joinsVisit({ places: 6 })).toBe(false);
    expect(joinsVisit({ places: 6, courseDates: ["2026-11-20", "2026-11-27"] })).toBe(false);
  });

  it("runs the services back to back, keeping only the last tidy-up time", () => {
    const t = visitTimeline(ten, [cut, colour]);
    expect(t.map((x) => [hhmm(x.start), hhmm(x.end), hhmm(x.blockEnd)])).toEqual([["10:00", "11:00", "11:00"], ["11:00", "12:30", "12:40"]]);
  });

  it("adds up the price, asks the card for each part's own share and taxes only the taxed part", () => {
    const v = visitService(cut, [colour]);
    expect(v.priceMinor).toBe(18000);
    expect(v.payment).toBe("deposit");
    expect(v.depositMinor).toBe(9000);
    expect(v.taxedMinor).toBe(12000);
    expect(v.chargeTax).toBe(true);
    expect(v.gapAfter).toBe(0);
    expect(visitService({ ...cut, payment: "atShop" }, [{ ...colour, payment: "atShop" }]).payment).toBe("atShop");
    expect(visitService({ ...cut, payment: "free", priceMinor: 0 }, [{ ...colour, payment: "free", priceMinor: 0 }]).payment).toBe("free");
    expect(visitService(cut, [{ ...colour, payment: "full" }]).payment).toBe("full");
    // On its own, a service keeps its own money rules.
    expect(visitService(cut, []).gapAfter).toBe(15);
  });

  it("gives each service someone who does it, keeping the same person when they can", () => {
    expect(visitStaff({ services: [cut, colour], settings: team, busy: [], start: ten, zone: ZONE, nowMs: NOW })).toEqual(["ana", "ben"]);
    expect(visitStaff({ services: [colour, cut], settings: team, busy: [], start: ten, zone: ZONE, nowMs: NOW })).toEqual(["ben", "ben"]);
    // Ben busy for the colour: the visit doesn't fit at ten.
    const benBusy = [{ start: at(day, "11:30"), end: at(day, "12:00"), staffId: "ben" }];
    expect(visitStaff({ services: [cut, colour], settings: team, busy: benBusy, start: ten, zone: ZONE, nowMs: NOW })).toBeNull();
    // Asked for by name.
    expect(visitStaff({ services: [cut, cut], staffIds: ["", "ben"], settings: team, busy: [], start: ten, zone: ZONE, nowMs: NOW })).toEqual(["ana", "ben"]);
    expect(visitStaff({ services: [cut, colour], staffIds: ["", "ana"], settings: team, busy: [], start: ten, zone: ZONE, nowMs: NOW })).toBeNull();
  });

  it("never puts one person on two services at once, and books the shop's one calendar back to back", () => {
    const one = { ...settings, minNoticeHours: 0 };
    expect(visitStaff({ services: [cut, colour], settings: one, busy: [], start: ten, zone: ZONE, nowMs: NOW })).toEqual(["", ""]);
    expect(visitStaff({ services: [cut, colour], settings: one, busy: [{ start: at(day, "12:00"), end: at(day, "12:30") }], start: ten, zone: ZONE, nowMs: NOW })).toBeNull();
  });

  it("offers only starts where the whole visit ends inside the hours", () => {
    const times = visitFreeTimes({ services: [cut, colour], settings: team, busy: [], day, zone: ZONE, nowMs: NOW }).map(hhmm);
    expect(times[0]).toBe("10:00");
    // 2.5 hours from 14:30 ends at 17:00, the closing time; 15:00 would run past it.
    expect(times).toContain("14:30");
    expect(times).not.toContain("15:00");
  });

  it("checks a later service at any minute, inside the hours, never on a day off", () => {
    expect(fitsAt({ service: colour, settings: team, busy: [], start: at(day, "11:10"), zone: ZONE, nowMs: NOW })).toBe("ben");
    expect(fitsAt({ service: colour, settings: team, busy: [], start: at(day, "16:00"), zone: ZONE, nowMs: NOW })).toBeNull();
    expect(fitsAt({ service: colour, settings: { ...team, daysOff: [day] }, busy: [], start: ten, zone: ZONE, nowMs: NOW })).toBeNull();
    expect(fitsAt({ service: { ...colour, places: 4 }, settings: team, busy: [], start: ten, zone: ZONE, nowMs: NOW })).toBeNull();
  });
});

describe("lengths and prices (one service in several lengths)", () => {
  const L = [{ id: "a", name: "", minutes: 30, priceMinor: 3000 }, { id: "b", name: "Long", minutes: 90, priceMinor: 7000 }];
  it("keeps two or more good lengths, at most MAX_LENGTHS", () => {
    expect(cleanLengths(L)).toEqual(L);
    expect(cleanLengths([L[0]])).toEqual([]);
    expect(cleanLengths([L[0], { minutes: 3, priceMinor: 100 }])).toEqual([]);
    expect(cleanLengths([L[0], { minutes: 600, priceMinor: 100 }])).toEqual([]);
    expect(cleanLengths([L[0], { minutes: 45, priceMinor: 20 }])).toEqual([]);
    expect(cleanLengths([L[0], { minutes: 45 }], false)).toEqual([{ ...L[0], priceMinor: 0 }, { id: "l2", name: "", minutes: 45, priceMinor: 0 }]);
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, minutes: 15 * (i + 1), priceMinor: 1000 }));
    expect(cleanLengths(many)).toHaveLength(MAX_LENGTHS);
  });
  it("names a length by its own name, else its time", () => {
    expect(lengthName({ name: "", minutes: 90 })).toBe("1 h 30 min");
    expect(lengthName({ name: "", minutes: 45 })).toBe("45 min");
    expect(lengthName({ name: "", minutes: 120 })).toBe("2 h");
    expect(lengthName({ name: "Long", minutes: 90 })).toBe("Long");
  });
  it("books the chosen length (none = the first) and refuses an unknown one", () => {
    const s = { name: "Massage", minutes: 30, priceMinor: 3000, lengths: L };
    expect(withLength(s, "b")).toMatchObject({ service: { name: "Massage, Long", minutes: 90, priceMinor: 7000, lengthId: "b" } });
    expect(withLength(s, undefined)).toMatchObject({ service: { name: "Massage, 30 min", minutes: 30, lengthId: "a" } });
    expect(withLength(s, "zz")).toHaveProperty("problem");
    expect(withLength({ name: "Cut", minutes: 45, priceMinor: 0 }, "b")).toEqual({ service: { name: "Cut", minutes: 45, priceMinor: 0 } });
  });
  it("keeps processing time only while it fits inside the length", () => {
    const s = { name: "Colour", minutes: 90, priceMinor: 9000, processAfter: 20, processMinutes: 30, lengths: [{ id: "s", name: "", minutes: 45, priceMinor: 5000 }, { id: "l", name: "", minutes: 120, priceMinor: 12000 }] };
    const short = withLength(s, "s"), long = withLength(s, "l");
    expect("service" in short && short.service.processMinutes).toBeFalsy();
    expect("service" in long && long.service.processMinutes).toBe(30);
  });
  it("a person's own rate doesn't change a service sold in lengths", () => {
    const s = { id: "m", name: "Massage", minutes: 30, priceMinor: 3000, lengths: L } as never;
    const set = { ...DEFAULT_BOOKING_SETTINGS, staff: [{ id: "p", name: "Pat", active: true, services: [], rates: { m: { minutes: 50, priceMinor: 9900 } } }] } as never;
    expect(forPerson(s, set, "p")).toBe(s);
  });
});

describe("service groups and photos (plan 4, 2.3)", () => {
  it("keeps a group to one short line and a photo to an https link", () => {
    expect(serviceGroup("  Cuts\n and   colour ")).toBe("Cuts and colour");
    expect(serviceGroup("x".repeat(60))).toHaveLength(MAX_GROUP_LENGTH);
    expect(serviceGroup(7)).toBe("");
    expect(servicePhoto("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect(servicePhoto("http://cdn.example.com/a.jpg")).toBe("");
    expect(servicePhoto('https://x.example/a.jpg" onerror="x')).toBe("");
  });
  it("groups services where each group first appears, with ungrouped ones last", () => {
    const list = [{ id: "a", group: "Colour" }, { id: "b" }, { id: "c", group: "Cuts" }, { id: "d", group: "colour" }, { id: "e", group: "" }];
    expect(groupServices(list).map((g) => [g.group, g.services.map((s) => s.id)])).toEqual([["Colour", ["a", "d"]], ["Cuts", ["c"]], ["", ["b", "e"]]]);
    expect(groupServices([{ id: "a" }, { id: "b" }])).toEqual([{ group: "", services: [{ id: "a" }, { id: "b" }] }]);
    expect(groupServices([])).toEqual([]);
  });
});

describe("team photos and bios (plan 4, 2.4)", () => {
  it("keeps an https photo and a one-paragraph bio, drops the rest", () => {
    const [ana, ben] = cleanStaff([
      { id: "ana", name: "Ana", photo: "https://example.com/a.jpg", bio: "  Ten years\n at the press.  " },
      { id: "ben", name: "Ben", photo: "http://example.com/b.jpg", bio: "x".repeat(400) },
    ]);
    expect(ana).toMatchObject({ photo: "https://example.com/a.jpg", bio: "Ten years at the press." });
    expect("photo" in ben).toBe(false);
    expect(ben.bio!.length).toBeLessThanOrEqual(MAX_BIO_LENGTH);
  });
});

describe("owner approves (plan 4, 2.5)", () => {
  it("keeps approval only for one-to-one services paid at the shop or free, with no card kept", () => {
    expect(cleanService({ name: "Review", minutes: 30, approval: true })).toMatchObject({ approval: true });
    expect(cleanService({ name: "Review", minutes: 30, payment: "atShop", priceMinor: 4000, approval: true })).toMatchObject({ approval: true });
    expect(cleanService({ name: "Review", minutes: 30, payment: "full", priceMinor: 4000, approval: true })).not.toMatchObject({ approval: true });
    expect(cleanService({ name: "Class", minutes: 30, places: 6, approval: true })).not.toMatchObject({ approval: true });
    expect(cleanService({ name: "Chat", minutes: 30, holdCard: true, lateFeeMinor: 2500, approval: true })).not.toMatchObject({ approval: true });
  });
  it("says which services can ask first", () => {
    expect(approvalAllowed({ payment: "free" })).toBe(true);
    expect(approvalAllowed({ payment: "deposit" })).toBe(false);
    expect(approvalAllowed({ payment: "atShop", courseDates: ["2026-12-01"] })).toBe(false);
  });
});

describe("visits at the client's place (plan 4, 2.8)", () => {
  it("keeps postal code starts once, upper case, and matches by the start", async () => {
    const { cleanAreas, inArea } = await import("./bookingTimes");
    expect(cleanAreas("m6g, M5V 1; m6g\n 90210")).toEqual(["M6G", "M5V1", "90210"]);
    expect(inArea("m6g 3h1", ["M6G"])).toBe(true);
    expect(inArea("M5V 2T6", ["M6G", "M5V1"])).toBe(false);
    expect(inArea("anything", [])).toBe(true);
    expect(inArea("", ["M6G"])).toBe(false);
  });
  it("needs street, city and postal code, and writes them on one line", async () => {
    const { cleanVisitAddress, addressLine } = await import("./bookingTimes");
    expect(cleanVisitAddress({ street: "1 Ink Lane", city: "Toronto" })).toBeNull();
    const at = cleanVisitAddress({ street: " 1  Ink Lane ", city: "Toronto", postcode: "m6g 3h1" })!;
    expect(addressLine(at)).toBe("1 Ink Lane, Toronto M6G 3H1");
  });
  it("lets only a one-to-one service visit the client", () => {
    const base = { id: "s", name: "Haircut at home", minutes: 60, atClient: true, areas: "m6g" };
    const one = cleanService(base);
    expect("problem" in one ? null : [one.atClient, one.areas]).toEqual([true, ["M6G"]]);
    const cls = cleanService({ ...base, places: 4 });
    expect("problem" in cls ? null : cls.atClient).toBeUndefined();
  });
});

describe("time zones for online visits (plan 4, 2.9)", () => {
  it("keeps only zones the clock knows and tells when two clocks differ", async () => {
    const { cleanZone, zonesDiffer } = await import("./bookingTimes");
    expect(cleanZone("Europe/London")).toBe("Europe/London");
    expect(cleanZone("Mars/Olympus")).toBe("");
    expect(cleanZone("<script>")).toBe("");
    const ms = Date.parse("2026-11-17T15:00:00Z");
    expect(zonesDiffer("America/Toronto", "America/New_York", ms)).toBe(false);
    expect(zonesDiffer("America/Toronto", "Europe/London", ms)).toBe(true);
    expect(zonesDiffer("", "Europe/London", ms)).toBe(false);
  });
});
