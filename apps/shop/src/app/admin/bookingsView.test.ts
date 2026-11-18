import { describe, expect, it } from "vitest";
import { expandParts, visitShares, bookingFigures, lastMonths, monthText, moneyShort, byDay, classCount, daySlots, waitingByDay, waitingText, nextUp, paymentText, weekDays, weekFigures, weekStartOf, weekText, whenFromNow, teamDay, hourLabel, NOBODY, teamPay, teamPayRows, bookingShareLink, bookButtonHtml, weekGrid, tappedTime, draggedTo, draggable, blockedBands, blockWhen, blockHours, processingBand, processingText, specialHoursLine, requestsWaiting, answerWithin } from "./bookingsView";
import { DEFAULT_BOOKING_SETTINGS, type StaffMember } from "../../shared/bookingTimes";
import type { Booking } from "./bookingsApi";

const ZONE = "America/Toronto";
const AFTER = Date.parse("2027-01-01T00:00:00.000Z");
const b = (over: Partial<Booking>): Booking => ({
  id: "x", serviceId: "s", serviceName: "Visit", minutes: 60, start: "2026-11-17T15:00:00.000Z", end: "2026-11-17T16:00:00.000Z",
  customer: { name: "Ada", email: "ada@example.com" }, status: "confirmed", payment: "free", priceMinor: 0, currency: "CAD", paid: false, ...over,
});

describe("the week", () => {
  it("starts on Monday, even from a Sunday", () => {
    expect(weekStartOf("2026-11-22")).toBe("2026-11-16");
    expect(weekStartOf("2026-11-16")).toBe("2026-11-16");
    expect(weekDays("2026-11-16")).toHaveLength(7);
    expect(weekDays("2026-11-16")[6]).toBe("2026-11-22");
  });
  it("names the week, across months too", () => {
    expect(weekText("2026-11-16")).toMatch(/16.22 November 2026/);
    expect(weekText("2026-11-30")).toMatch(/30 November . 6 December 2026/);
  });
});

describe("the list", () => {
  it("groups bookings by the shop's day and leaves out cancelled ones", () => {
    const late = b({ id: "late", start: "2026-11-18T03:30:00.000Z", end: "2026-11-18T04:00:00.000Z" });
    const groups = byDay([late, b({ id: "a" }), b({ id: "gone", status: "cancelled" })], ZONE);
    expect([...groups.keys()]).toEqual(["2026-11-17"]);
    expect(groups.get("2026-11-17")!.map((x) => x.id)).toEqual(["a", "late"]);
  });
  it("finds the next booking and says when it is", () => {
    const now = Date.parse("2026-11-17T14:35:00Z");
    const rows = [b({ id: "past", start: "2026-11-17T12:00:00.000Z", end: "2026-11-17T13:00:00.000Z" }), b({ id: "a" }), b({ id: "held", status: "held", start: "2026-11-17T14:40:00.000Z" })];
    expect(nextUp(rows, now)?.id).toBe("a");
    expect(whenFromNow(rows[1], now, ZONE)).toBe("in 25 minutes");
    expect(whenFromNow(b({ start: "2026-11-18T15:00:00.000Z" }), now, ZONE)).toBe("tomorrow");
  });
  it("says how each booking is paid in plain words", () => {
    expect(paymentText(b({}))).toBe("Free");
    expect(paymentText(b({ payment: "card", paid: true, priceMinor: 4000 }))).toMatch(/^Paid .*40\.00 by card$/);
    expect(paymentText(b({ payment: "card", status: "held", priceMinor: 4000 }))).toBe("Paying now");
    expect(paymentText(b({ payment: "atShop", priceMinor: 2500 }))).toMatch(/25\.00 to pay at the shop$/);
    expect(paymentText(b({ payment: "card", paid: true, priceMinor: 4000, refund: { amountMinor: 4000, at: "x" } }))).toMatch(/^Refunded/);
    const gift = { id: "g", last4: "NP23", amountMinor: 2500 };
    expect(paymentText(b({ payment: "card", paid: true, priceMinor: 4000, giftCard: gift }))).toMatch(/40\.00 by card and gift card$/);
    expect(paymentText(b({ payment: "card", paid: true, priceMinor: 2500, giftCard: gift }))).toMatch(/25\.00 by gift card$/);
    expect(paymentText(b({ payment: "deposit", depositPaid: true, priceMinor: 10000, depositMinor: 2500, giftCard: gift }))).toMatch(/deposit paid by gift card, .*75\.00 to pay at the shop$/);
  });
  it("adds up the week", () => {
    expect(weekFigures([b({}), b({ minutes: 30, payment: "card", paid: true, priceMinor: 4000 }), b({ status: "cancelled" })])).toEqual({ count: 2, hours: 1.5, takenMinor: 4000 });
  });
});

describe("a group class in the week", () => {
  it("puts everyone at one start of a class on one card, and leaves other bookings alone", () => {
    const list = [b({ id: "1" }), b({ id: "2", serviceId: "ws", serviceName: "Workshop" }), b({ id: "3", serviceId: "ws", serviceName: "Workshop" }),
      b({ id: "4", serviceId: "ws", serviceName: "Workshop", start: "2026-11-17T19:00:00.000Z" })];
    const slots = daySlots(list, (id) => (id === "ws" ? 8 : 1));
    expect(slots.map((s) => (s.kind === "class" ? s.people.map((p) => p.id) : s.booking.id))).toEqual(["1", ["2", "3"], ["4"]]);
    expect(slots[1]).toMatchObject({ kind: "class", places: 8, serviceName: "Workshop" });
  });
  it("says how full it is", () => {
    expect(classCount(5, 8)).toBe("5 of 8 booked");
    expect(classCount(8, 8)).toBe("Full · 8 booked");
  });
});

describe("the waiting list", () => {
  const w = (id: string, day: string, createdAt: string) => ({ id, serviceId: "s", serviceName: "Workshop", day, start: null, name: id, email: `${id}@example.com`, createdAt });
  it("groups people by day in the order they asked", () => {
    const days = waitingByDay([w("late", "2026-11-21", "2026-11-18T10:00:00Z"), w("other", "2026-11-22", "2026-11-17T10:00:00Z"), w("early", "2026-11-21", "2026-11-17T09:00:00Z")]);
    expect(days.get("2026-11-21")!.map((x) => x.id)).toEqual(["early", "late"]);
    expect(days.get("2026-11-22")).toHaveLength(1);
    expect(waitingText(3)).toBe("3 waiting");
  });
});

describe("the figures", () => {
  it("lists the last months oldest first, across a new year", () => {
    expect(lastMonths("2027-02-03", 4)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthText("2026-11")).toMatch(/Nov/);
    expect(moneyShort(28049, "CAD")).toMatch(/280$/);
  });
  it("counts bookings, kept money, no-shows and cancellations by month, weekday and service", () => {
    const card = { payment: "card" as const, paid: true, priceMinor: 4000 };
    const f = bookingFigures([
      b({ id: "1", ...card }),                                                               // Tue 17 Nov, 40.00
      b({ id: "2", start: "2026-11-21T19:00:00.000Z", serviceName: "Workshop", noShow: true }), // Sat 21 Nov, no-show
      b({ id: "3", ...card, status: "cancelled", refund: { amountMinor: 3000, at: "" } }),     // cancelled, 10.00 kept
      b({ id: "4", ...card, status: "held", paid: false }),                                     // still paying: ignored
      b({ id: "5", start: "2026-10-06T15:00:00.000Z", payment: "atShop", paid: true, priceMinor: 2500 }), // Tue 6 Oct
      b({ id: "6", start: "2026-12-01T15:00:00.000Z" }),                                      // next month: not in view
      b({ id: "7", start: "2026-11-01T03:30:00.000Z" }),                                      // 31 Oct in Toronto
    ], ZONE, ["2026-10", "2026-11"], Date.parse("2026-11-20T12:00:00Z"));
    expect(f.months).toEqual([
      { month: "2026-10", count: 2, takenMinor: 2500, noShows: 0, cancelled: 0 },
      { month: "2026-11", count: 2, takenMinor: 5000, noShows: 1, cancelled: 1 },
    ]);
    expect(f).toMatchObject({ count: 4, takenMinor: 7500, noShows: 1, cancelled: 1, noShowPercent: 33 });
    expect(f.weekdays.map((w) => [w.day, w.count])).toEqual([["Monday", 0], ["Tuesday", 2], ["Wednesday", 0], ["Thursday", 0], ["Friday", 0], ["Saturday", 2], ["Sunday", 0]]);
    expect(f.services).toEqual([{ name: "Visit", count: 3 }, { name: "Workshop", count: 1 }]);
    expect(bookingFigures([], ZONE, ["2026-11"], 0).noShowPercent).toBeNull();
  });
});

describe("deposits", () => {
  const dep = (over: Partial<Booking> = {}) => b({ payment: "deposit", priceMinor: 14000, depositMinor: 3500, depositPaid: true, ...over });
  it("says what the deposit covered and what is left for the visit", () => {
    expect(paymentText(dep())).toMatch(/35\.00 deposit paid by card, .*105\.00 to pay at the shop$/);
    expect(paymentText(dep({ paid: true }))).toMatch(/^Paid .*140\.00 \(.*35\.00 deposit by card, the rest at the shop\)$/);
    expect(paymentText(dep({ depositPaid: false, status: "held" }))).toBe("Paying the deposit now");
    expect(paymentText(dep({ rest: { amountMinor: 10500, at: "" } }))).toMatch(/^Paid .*140\.00 by card \(deposit, then the rest online\)$/);
    expect(paymentText(b({ payment: "atShop", priceMinor: 6000, paid: false, rest: { amountMinor: 6000, at: "" } }))).toMatch(/^Paid .*60\.00 by card online$/);
    expect(paymentText(dep({ status: "cancelled", refund: { amountMinor: 1000, at: "" } }))).toMatch(/^Refunded .*10\.00 of .*35\.00$/);
  });
  it("counts only money really taken: the deposit, then the whole price once the rest is paid", () => {
    expect(weekFigures([dep(), dep({ paid: true }), b({ payment: "atShop", priceMinor: 6000 })]).takenMinor).toBe(3500 + 14000);
    const figures = bookingFigures([dep({ status: "cancelled", refund: { amountMinor: 1000, at: "" } }), dep()], ZONE, ["2026-11"]);
    expect(figures.months.reduce((n, m) => n + m.takenMinor, 0)).toBe(2500 + 3500);
  });
});

describe("the team's day", () => {
  // Tuesday 17 November 2026 in Toronto: 10:00 there is 15:00Z.
  const day = "2026-11-17";
  const person = (over: Partial<StaffMember>): StaffMember => ({ id: "ana", name: "Ana", active: true, serviceIds: [], ownHours: false, hours: DEFAULT_BOOKING_SETTINGS.hours, daysOff: [], email: "", ...over });
  const settings = (staff: StaffMember[], over = {}) => ({ ...DEFAULT_BOOKING_SETTINGS, staff, ...over });

  it("gives each active person a column, in team order, with their bookings placed by time", () => {
    const rows = [
      b({ id: "1", staffId: "ben", start: "2026-11-17T15:00:00.000Z", end: "2026-11-17T16:00:00.000Z" }),
      b({ id: "2", staffId: "ana", start: "2026-11-17T16:30:00.000Z", end: "2026-11-17T17:00:00.000Z" }),
      b({ id: "3", staffId: "ana", status: "cancelled" }),
    ];
    const t = teamDay(rows, settings([person({}), person({ id: "ben", name: "Ben" }), person({ id: "cy", name: "Cy", active: false })]), day, ZONE);
    expect(t.columns.map((c) => c.name)).toEqual(["Ana", "Ben"]);
    expect(t.count).toBe(2);
    const ana = t.columns[0].blocks[0];
    expect(ana.top + t.startMin).toBe(11 * 60 + 30);
    expect(ana.height).toBe(30);
    expect(t.columns[1].blocks[0].people.map((p) => p.id)).toEqual(["1"]);
  });

  it("shows a switched-off person who still has a booking, and a Not assigned column for bookings naming nobody", () => {
    const rows = [b({ id: "1", staffId: "cy" }), b({ id: "2" }), b({ id: "3", staffId: "gone" })];
    const t = teamDay(rows, settings([person({}), person({ id: "cy", name: "Cy", active: false })]), day, ZONE);
    expect(t.columns.map((c) => [c.id, c.name])).toEqual([["ana", "Ana"], ["cy", "Cy"], [NOBODY, "Not assigned"]]);
    expect(t.columns[2].blocks.flatMap((x) => x.people.map((p) => p.id))).toEqual(["2", "3"]);
  });

  it("marks a person off on their day off, the shop's day off, or with no hours that weekday", () => {
    const own = DEFAULT_BOOKING_SETTINGS.hours.map((h, i) => (i === 2 ? [] : h));
    const t = teamDay([], settings([person({ daysOff: [day] }), person({ id: "ben", name: "Ben", ownHours: true, hours: own }), person({ id: "cy", name: "Cy" })]), day, ZONE);
    expect(t.columns.map((c) => c.off)).toEqual([true, true, false]);
    expect(teamDay([], settings([person({})], { daysOff: [day] }), day, ZONE).columns[0].off).toBe(true);
  });

  it("puts a class's people on one card, and overlapping cards side by side", () => {
    const rows = [
      b({ id: "1", serviceId: "class", start: "2026-11-17T15:00:00.000Z" }),
      b({ id: "2", serviceId: "class", start: "2026-11-17T15:00:00.000Z" }),
      b({ id: "3", start: "2026-11-17T15:30:00.000Z", end: "2026-11-17T16:30:00.000Z" }),
      b({ id: "4", start: "2026-11-17T18:00:00.000Z", end: "2026-11-17T19:00:00.000Z" }),
    ];
    const blocks = teamDay(rows, settings([]), day, ZONE).columns[0].blocks;
    expect(blocks.map((x) => [x.people.length, x.lane, x.lanes])).toEqual([[2, 0, 2], [1, 1, 2], [1, 0, 1]]);
  });

  it("runs the grid in whole hours across every opening and booking", () => {
    const early = person({ id: "ben", name: "Ben", ownHours: true, hours: DEFAULT_BOOKING_SETTINGS.hours.map(() => [{ start: "07:30", end: "12:00" }]) });
    const t = teamDay([b({ start: "2026-11-18T00:00:00.000Z", end: "2026-11-18T00:45:00.000Z" })], settings([person({}), early]), day, ZONE);
    expect(t.startMin).toBe(7 * 60);
    expect(t.endMin).toBe(20 * 60);
    expect(hourLabel(7 * 60)).toBe("7 AM");
    expect(hourLabel(12 * 60)).toBe("12 PM");
    expect(hourLabel(13 * 60 + 30)).toBe("1:30 PM");
  });
});

describe("team pay", () => {
  const person = (over: Partial<StaffMember>): StaffMember => ({ id: "ana", name: "Ana", active: true, serviceIds: [], ownHours: false, hours: DEFAULT_BOOKING_SETTINGS.hours, daysOff: [], email: "", ...over });
  const paid = (over: Partial<Booking>) => b({ payment: "card", priceMinor: 11_300, taxMinor: 1_300, paid: true, ...over } as Partial<Booking>);

  it("adds up each person's takings before tax, commission at their share and tips", () => {
    const staff = [person({ commissionPercent: 40 }), person({ id: "ben", name: "Ben" }), person({ id: "cy", name: "Cy", active: false })];
    const rows = [
      paid({ id: "1", staffId: "ana", tip: { amountMinor: 2_000 } } as Partial<Booking>),
      paid({ id: "2", staffId: "ana", noShow: true }),
      paid({ id: "3", staffId: "ana", status: "cancelled", refund: { amountMinor: 11_300 } } as Partial<Booking>),
      paid({ id: "4", staffId: "ben", tip: { amountMinor: 500 } } as Partial<Booking>),
      paid({ id: "5" }),
      paid({ id: "6", staffId: "gone", staffName: "Dee" }),
      paid({ id: "7", staffId: "ana", status: "held" }),
      paid({ id: "8", staffId: "ana", start: "2026-12-01T15:00:00.000Z", end: "2026-12-01T16:00:00.000Z" }),
    ];
    const pay = teamPay(rows, staff, ZONE, "2026-11", AFTER);
    expect(pay.people.map((l) => [l.id, l.name, l.visits, l.takenMinor, l.percent, l.commissionMinor, l.tipsMinor])).toEqual([
      // Two kept visits' worth (the no-show still paid), the refunded one counts nothing; a held one and December don't count.
      ["ana", "Ana", 1, 20_000, 40, 8_000, 2_000],
      ["ben", "Ben", 1, 10_000, 0, 0, 500],
      ["gone", "Dee", 1, 10_000, 0, 0, 0],
      [NOBODY, "Not given to anyone", 1, 10_000, 0, 0, 0],
    ]);
    // Cy is off the team and had nothing this month, so is left out.
    expect(pay).toMatchObject({ takenMinor: 50_000, commissionMinor: 8_000, tipsMinor: 2_500 });
  });

  it("keeps the month by the shop's own day", () => {
    // 2 a.m. UTC on 1 December is still 30 November in Toronto.
    const late = paid({ staffId: "ana", start: "2026-12-01T02:00:00.000Z", end: "2026-12-01T03:00:00.000Z" });
    expect(teamPay([late], [person({})], ZONE, "2026-11", AFTER).people[0].visits).toBe(1);
    expect(teamPay([late], [person({})], ZONE, "2026-12", AFTER).people[0].visits).toBe(0);
  });

  it("counts a visit only once it has started", () => {
    const later = paid({ staffId: "ana", start: "2026-11-20T15:00:00.000Z", end: "2026-11-20T16:00:00.000Z" });
    expect(teamPay([later], [person({})], ZONE, "2026-11", Date.parse("2026-11-17T12:00:00.000Z")).people[0].visits).toBe(0);
    expect(teamPay([later], [person({})], ZONE, "2026-11", Date.parse("2026-11-20T15:00:00.000Z")).people[0].visits).toBe(1);
  });

  it("writes a spreadsheet with a total row", () => {
    const pay = teamPay([paid({ staffId: "ana", tip: { amountMinor: 1_050 } } as Partial<Booking>)], [person({ commissionPercent: 12.5 })], ZONE, "2026-11");
    expect(teamPayRows(pay)).toEqual([
      ["Person", "Visits", "Taken before tax", "Commission %", "Commission", "Tips", "Commission and tips"],
      ["Ana", "1", "100.00", "12.5", "12.50", "10.50", "23.00"],
      ["Total", "1", "100.00", "", "12.50", "10.50", "23.00"],
    ]);
  });
});

describe("sharing the booking page", () => {
  it("links to the page, a service or a person, as the booking page reads them", () => {
    expect(bookingShareLink("https://shop.example/book")).toBe("https://shop.example/book");
    expect(bookingShareLink("https://shop.example/book", { service: "cut" })).toBe("https://shop.example/book?service=cut");
    expect(bookingShareLink("https://shop.example/book", { service: "cut", person: "ana" })).toBe("https://shop.example/book?service=cut&with=ana");
  });

  it("writes a Book now button that is only a link, with the words made safe", () => {
    const html = bookButtonHtml("https://shop.example/book?service=cut&with=ana", ' Book "now" <b> ');
    expect(html).toMatch(/^<a href="https:\/\/shop\.example\/book\?service=cut&amp;with=ana" target="_blank" rel="noopener" style="[^"]+">Book &quot;now&quot; &lt;b&gt;<\/a>$/);
    expect(html).not.toMatch(/<script|<iframe|onclick/i);
    expect(bookButtonHtml("https://shop.example/book", "")).toContain(">Book now</a>");
    expect(bookButtonHtml("https://shop.example/book", "Go", "light")).toContain("background:#ffffff");
  });
});

describe("the week as an hour grid (plan 4, 1.1)", () => {
  const hours = Array.from({ length: 7 }, (_, wd) => (wd === 0 ? [] : [{ start: "10:00", end: "18:00" }]));
  const base = { ...DEFAULT_BOOKING_SETTINGS, hours, daysOff: ["2026-11-21"], staff: [] as StaffMember[] };
  const services = [{ id: "s", places: 1 }, { id: "yoga", places: 8 }];
  it("runs from the week's opening to its close, with a closed Sunday and day off", () => {
    const g = weekGrid([], base, services, "2026-11-16", ZONE);
    expect([g.startMin, g.endMin]).toEqual([600, 1080]);
    expect(g.days).toHaveLength(7);
    expect(g.days[6].closed).toBe(true);
    expect(g.days[5].closed).toBe(true);
    expect(g.days[0].closed).toBe(false);
  });
  it("places a booking by its time and stretches the grid to fit an early one", () => {
    // 10:00 in Toronto is 15:00Z; 8:30 is 13:30Z.
    const g = weekGrid([b({ id: "a" }), b({ id: "early", start: "2026-11-18T13:30:00.000Z", end: "2026-11-18T14:00:00.000Z" })], base, services, "2026-11-16", ZONE);
    expect(g.startMin).toBe(480);
    expect(g.days[1].blocks[0]).toMatchObject({ top: 120, height: 60, lanes: 1 });
    expect(g.days[2].blocks[0]).toMatchObject({ top: 30, height: 30 });
  });
  it("sets overlapping visits side by side and a class's people on one card", () => {
    const rows = [b({ id: "a" }), b({ id: "c", start: "2026-11-17T15:30:00.000Z", end: "2026-11-17T16:30:00.000Z" }),
      b({ id: "y1", serviceId: "yoga" }), b({ id: "y2", serviceId: "yoga" })];
    const day = weekGrid(rows, base, services, "2026-11-16", ZONE).days[1];
    expect(day.blocks).toHaveLength(3);
    expect(day.blocks.every((x) => x.lanes === 3)).toBe(true);
    expect(day.blocks.find((x) => x.serviceId === "yoga")!.people).toHaveLength(2);
  });
  it("gives a person their own ink, else the service's", () => {
    const staff = [{ id: "ana", name: "Ana", active: true, daysOff: [], ownHours: false, hours, serviceIds: [] }, { id: "ben", name: "Ben", active: true, daysOff: [], ownHours: false, hours, serviceIds: [] }] as unknown as StaffMember[];
    const day = weekGrid([b({ id: "a", staffId: "ben" }), b({ id: "y", serviceId: "yoga", start: "2026-11-17T18:00:00.000Z", end: "2026-11-17T19:00:00.000Z" })], { ...base, staff }, services, "2026-11-16", ZONE).days[1];
    expect(day.blocks.map((x) => x.ink)).toEqual([1, 1]);
    expect(weekGrid([b({ id: "a" })], base, services, "2026-11-16", ZONE).days[1].blocks[0].ink).toBe(0);
  });
  it("turns a tap into a start on the quarter hour, in the shop's time", () => {
    expect(tappedTime("2026-11-17", 10 * 60 + 52, ZONE)).toBe("2026-11-17T15:45:00.000Z");
    expect(tappedTime("2026-11-17", -5, ZONE)).toBe("2026-11-17T05:00:00.000Z");
  });
});

describe("dragging on the calendar (plan 4, 1.2)", () => {
  const visit = { start: "2026-11-17T15:10:00.000Z", minutes: 60 }; // 10:10 in Toronto
  it("moves by whole quarter hours, to another day too, keeping the length", () => {
    expect(draggedTo(visit, "2026-11-17", 55, "move", ZONE)).toEqual({ start: "2026-11-17T16:10:00.000Z", minutes: 60 });
    expect(draggedTo(visit, "2026-11-19", -7, "move", ZONE)).toEqual({ start: "2026-11-19T15:10:00.000Z", minutes: 60 });
  });
  it("stretches from the bottom edge, never under a quarter hour", () => {
    expect(draggedTo(visit, "2026-11-17", 29, "stretch", ZONE)).toEqual({ start: visit.start, minutes: 90 });
    expect(draggedTo(visit, "2026-11-17", -200, "stretch", ZONE).minutes).toBe(15);
  });
  it("lets the owner drag one person's confirmed visit that hasn't ended", () => {
    const now = Date.parse("2026-11-17T12:00:00.000Z");
    expect(draggable(b({}), 1, now)).toBe(true);
    expect(draggable(b({ status: "held" }), 1, now)).toBe(false);
    expect(draggable(b({}), 6, now)).toBe(false);
    expect(draggable(b({ course: { starts: [], days: [] } }), 1, now)).toBe(false);
    expect(draggable(b({}), 1, Date.parse("2026-11-18T00:00:00.000Z"))).toBe(false);
  });
});

describe("blocked time on the calendar (plan 4, 1.3)", () => {
  const lunch = { id: "l", title: "Lunch", staffId: "", day: "2026-11-16", start: "12:30", end: "13:15", weekly: true, until: "" };
  const dentist = { id: "d", title: "Dentist", staffId: "ana", day: "2026-11-17", start: "08:00", end: "10:00", weekly: false, until: "" };
  const staff = [{ id: "ana", name: "Ana" }];
  it("places a block by its clock, cut to the grid, on the right days", () => {
    expect(blockedBands([lunch], "2026-11-23", 540, 1080)).toEqual([{ block: lunch, top: 210, height: 45, who: "Everyone" }]);
    expect(blockedBands([lunch], "2026-11-24", 540, 1080)).toEqual([]);
    // Starts before the grid's first hour: only the part on show.
    expect(blockedBands([dentist], "2026-11-17", 540, 1080, staff)).toEqual([{ block: dentist, top: 0, height: 60, who: "Ana" }]);
    expect(blockedBands([{ ...dentist, start: "06:00", end: "08:00" }], "2026-11-17", 540, 1080)).toEqual([]);
  });
  it("shows each team column the shop's blocks and its own", () => {
    const both = [lunch, { ...dentist, day: "2026-11-16", start: "12:00", end: "14:00" }];
    expect(blockedBands(both, "2026-11-16", 540, 1080, staff, "ana").map((b) => b.block.id)).toEqual(["d", "l"]);
    expect(blockedBands(both, "2026-11-16", 540, 1080, staff, "ben").map((b) => b.block.id)).toEqual(["l"]);
    expect(blockedBands(both, "2026-11-16", 540, 1080, staff, "").map((b) => b.block.id)).toEqual(["l"]);
  });
  it("says when and for how long in plain words", () => {
    expect(blockWhen({ ...lunch, until: "2026-12-14" })).toMatch(/^Every Monday, until /);
    expect(blockWhen(dentist)).toMatch(/17/);
    expect(blockHours(lunch)).toBe("12:30 PM to 1:15 PM");
    expect(blockHours({ start: "00:00", end: "24:00" })).toBe("All day");
  });
});

describe("processing time on the calendar (plan 4, 1.5)", () => {
  it("places the stretch inside the card and says it in words", () => {
    const b = { minutes: 120, processAfter: 30, processMinutes: 45 };
    expect(processingBand(b, 120)).toEqual({ top: "25%", height: "37.5%" });
    expect(processingBand({ minutes: 60 }, 60)).toBeNull();
    // A booking stretched shorter than its processing loses it.
    expect(processingBand({ ...b, minutes: 60 }, 60)).toBeNull();
    expect(processingText(b)).toBe("Processing 45 min, from 30 min in");
    expect(processingText({ minutes: 60 })).toBe("");
  });
});

describe("holiday hours on the calendar (plan 4, 1.7)", () => {
  const hours = Array.from({ length: 7 }, (_, wd) => (wd === 0 ? [] : [{ start: "10:00", end: "18:00" }]));
  const base = { ...DEFAULT_BOOKING_SETTINGS, hours, daysOff: [], staff: [] as StaffMember[] };
  it("draws the week with its holiday hours, closed days and all", () => {
    const g = weekGrid([], { ...base, specialHours: [{ id: "h", label: "", from: "2026-11-18", to: "2026-11-19", hours: [] }, { id: "s", label: "", from: "2026-11-22", to: "2026-11-22", hours: [{ start: "08:00", end: "11:00" }] }] }, [], "2026-11-16", ZONE);
    expect(g.days.map((d) => d.closed)).toEqual([false, false, true, true, false, false, false]);
    expect(g.days[6].hours).toEqual([{ start: "08:00", end: "11:00" }]);
    expect(g.startMin).toBe(480);
  });
  it("says a stretch in a line", () => {
    expect(specialHoursLine({ from: "2026-12-24", to: "2026-12-24", hours: [] })).toMatch(/Dec.*· Closed$/);
    expect(specialHoursLine({ from: "2026-12-21", to: "2027-01-02", hours: [{ start: "10:00", end: "14:00" }] })).toMatch(/ – .*· 10:00–14:00$/);
  });
});

describe("several services in one visit (plan 4, 2.1)", () => {
  const part = (over: Record<string, unknown>) => ({ serviceId: "colour", serviceName: "Colour", minutes: 60, gapAfter: 0, priceMinor: 6000, staffId: "ben", staffName: "Ben", roomId: "", roomName: "", start: "2026-11-17T16:00:00.000Z", end: "2026-11-17T17:00:00.000Z", ...over });
  const visit = b({ id: "v", serviceId: "cut", serviceName: "Cut", staffId: "ana", staffName: "Ana", minutes: 120, end: "2026-11-17T17:00:00.000Z",
    payment: "atShop", priceMinor: 10000, leadPriceMinor: 4000, paid: true, parts: [part({})] });

  it("draws each service as its own card, opening the whole visit", () => {
    const rows = expandParts([visit, b({ id: "plain" })]);
    expect(rows.map((r) => [r.id, r.serviceName, r.staffId, r.start, r.end, r.partIndex])).toEqual([
      ["v", "Cut", "ana", "2026-11-17T15:00:00.000Z", "2026-11-17T16:00:00.000Z", 0],
      ["v", "Colour", "ben", "2026-11-17T16:00:00.000Z", "2026-11-17T17:00:00.000Z", 1],
      ["plain", "Visit", undefined, "2026-11-17T15:00:00.000Z", "2026-11-17T16:00:00.000Z", undefined],
    ]);
    expect(rows[0].minutes).toBe(60);
    expect(rows[1].whole).toBe(visit);
    const grid = weekGrid(rows, { ...DEFAULT_BOOKING_SETTINGS, staff: [] }, [], "2026-11-16", ZONE);
    const keys = grid.days.find((d) => d.day === "2026-11-17")!.blocks.map((k) => k.key).sort();
    expect(keys).toEqual(["plain", "v", "v~p1"]);
  });

  it("can't be dragged: the whole visit moves from its drawer", () => {
    expect(draggable(visit, 1, 0)).toBe(false);
    expect(draggable(expandParts([visit])[1], 1, 0)).toBe(false);
    expect(draggable(b({}), 1, 0)).toBe(true);
  });

  it("shares the money by each service's price and counts the visit once per person", () => {
    expect(visitShares(visit).map((s) => [s.staffId, s.share])).toEqual([["ana", 0.4], ["ben", 0.6]]);
    const staff = [{ id: "ana", name: "Ana" }, { id: "ben", name: "Ben" }].map((p) => ({ ...p, active: true, serviceIds: [], ownHours: false, hours: DEFAULT_BOOKING_SETTINGS.hours, daysOff: [] }) as unknown as StaffMember);
    const pay = teamPay([visit], staff, ZONE, "2026-11", AFTER);
    const of = (id: string) => pay.people.find((l) => l.id === id)!;
    expect([of("ana").takenMinor, of("ben").takenMinor]).toEqual([4000, 6000]);
    expect([of("ana").visits, of("ben").visits]).toEqual([1, 1]);
    expect(pay.takenMinor).toBe(10000);
    // Both services with one person: one visit, all the money.
    const solo = { ...visit, parts: [part({ staffId: "ana", staffName: "Ana" })] };
    const one = teamPay([solo], staff, ZONE, "2026-11", AFTER).people.find((l) => l.id === "ana")!;
    expect([one.visits, one.takenMinor]).toEqual([1, 10000]);
  });
});

describe("requests to answer (plan 4, 2.5)", () => {
  const now = Date.parse("2026-11-18T12:00:00.000Z");
  it("lists open requests, the soonest answer-by first", () => {
    const rows = [
      b({ id: "late", status: "requested", answerBy: "2026-11-19T12:00:00.000Z" }),
      b({ id: "soon", status: "requested", answerBy: "2026-11-18T15:00:00.000Z" }),
      b({ id: "gone", status: "requested", answerBy: "2026-11-18T11:00:00.000Z" }),
      b({ id: "done", status: "confirmed" }),
    ];
    expect(requestsWaiting(rows, now).map((r) => r.id)).toEqual(["soon", "late"]);
  });
  it("says how long is left in plain words", () => {
    expect(answerWithin({ answerBy: "2026-11-18T17:00:00.000Z", start: "x" }, now)).toBe("Answer within 5 hours");
    expect(answerWithin({ answerBy: "2026-11-18T12:40:00.000Z", start: "x" }, now)).toBe("Answer within 40 minutes");
    expect(answerWithin({ answerBy: "2026-11-18T13:00:00.000Z", start: "x" }, now)).toBe("Answer within 1 hour");
    expect(answerWithin({ answerBy: "2026-11-18T11:00:00.000Z", start: "x" }, now)).toBe("Answer within 1 minute");
  });
});
