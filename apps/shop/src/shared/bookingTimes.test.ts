import { describe, expect, it } from "vitest";
import {
  rebookDue,
  addDays, bookingIcs, cleanBookingSettings, cleanService, clashes, customerCanChange, dayOf, daysTouched, DEFAULT_BOOKING_SETTINGS,
  cleanAnswers, cleanClassTimes, cleanQuestions, freeTimes, placesLeft, googleCalendarLink, isFreeTime, MAX_QUESTIONS, zonedTime,
  secondReminderDue, summaryDue, pickupSlots, pickupTimeProblem, PICKUP_DAYS_AHEAD, MAX_PICKUP_PER_SLOT,
  cleanCheckInCode, checkInCodeFrom, CHECK_IN_ALPHABET,
  cleanStaff, cleanRooms, staffFor, whoIsFree, MAX_STAFF, MAX_ROOMS, classStartsOn,
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
