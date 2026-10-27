import { describe, expect, it } from "vitest";
import {
  bookOfTheWeek, calendarLegend, calendarLevel, calendarMonths, daysToShip, goalGap, niceTicks, hasSignedEdition, isSignedLine, launchCurves, monthGoal, parseGoal, salesCalendar, shipHeadline, shipWeeks, signedMix, weekdayOf,
} from "./overviewNewSales";

const order = (day: string, total: number, items: any[] = [], extra: any = {}) => ({ createdAt: `${day}T16:00:00Z`, total, items, ...extra });
const line = (id: string, quantity: number, price = 20, extra: any = {}) => ({ id, quantity, price, title: id, ...extra });

describe("salesCalendar", () => {
  const paid = [order("2026-10-18", 50), order("2026-10-17", 20), order("2026-10-16", 10), order("2026-10-10", 80), order("2025-01-01", 999)];
  const cal = salesCalendar(paid, "2026-10-18");

  it("covers 365 days in Monday-first weeks and ignores older orders", () => {
    expect(cal.days).toBe(365);
    expect(cal.total).toBe(160);
    expect(cal.daysWithSale).toBe(4);
    expect(cal.weeks.every(w => w.length === 7)).toBe(true);
    expect(cal.weeks.flat().filter(Boolean)).toHaveLength(365);
    // 2026-10-18 is a Sunday: the last column ends on it.
    expect(weekdayOf("2026-10-18")).toBe(6);
    expect(cal.weeks[cal.weeks.length - 1][6]?.date).toBe("2026-10-18");
  });

  it("finds the longest run of selling days and the busiest day", () => {
    expect(cal.longest).toEqual({ length: 3, from: "2026-10-16", to: "2026-10-18" });
    expect(cal.busiest?.date).toBe("2026-10-10");
    expect(cal.max).toBe(80);
  });

  it("labels months on the week holding their first day", () => {
    const oct = cal.months.filter(m => m.label === "Oct").pop(); // the range also starts in October 2025
    const col = cal.weeks.findIndex(w => w.some(d => d?.date === "2026-10-01"));
    expect(oct?.col).toBe(col);
  });

  it("shades days in quarters of the best day", () => {
    expect(calendarLevel(0, 80)).toBe(0);
    expect(calendarLevel(1, 80)).toBe(1);
    expect(calendarLevel(80, 80)).toBe(4);
    expect(calendarLevel(41, 80)).toBe(3);
  });

  it("says what each shade means in money", () => {
    expect(calendarLegend(80)).toEqual([{ level: 1, upTo: 20 }, { level: 2, upTo: 40 }, { level: 3, upTo: 60 }, { level: 4, upTo: 80 }]);
    expect(calendarLegend(0)).toEqual([]);
  });

  it("totals each month and names the best one", () => {
    const m = calendarMonths(cal);
    expect(m.months.find(x => x.month === "2026-10")).toMatchObject({ revenue: 160, orders: 4 });
    expect(m.best).toEqual({ month: "2026-10", revenue: 160 });
    expect(calendarMonths(salesCalendar([], "2026-10-18")).best).toBeNull();
  });
});

describe("niceTicks", () => {
  it("steps in round numbers up to at least the top", () => {
    expect(niceTicks(7)).toEqual([0, 5, 10]);
    expect(niceTicks(30)).toEqual([0, 10, 20, 30]);
    expect(niceTicks(1)).toEqual([0, 0.5, 1]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe("monthGoal", () => {
  it("compares this month with an even pace", () => {
    const g = monthGoal([order("2026-10-02", 600), order("2026-10-15", 600), order("2026-09-30", 500)], "2026-10-18", 2000);
    expect(g.soFar).toBe(1200);
    expect(g.share).toBe(60);
    expect(g.paceShare).toBeCloseTo((18 / 31) * 100);
    expect(g.ahead).toBe(true);
    expect(g.needPerDay).toBeCloseTo(800 / 13);
    expect(g.month).toMatch(/October 2026/);
  });
  it("says how much is left to go and how far off an even pace", () => {
    const g = monthGoal([order("2026-10-02", 600)], "2026-10-18", 2000);
    const gap = goalGap(g);
    expect(gap.toGo).toBe(1400);
    expect(gap.daysLeft).toBe(13);
    expect(gap.perDay).toBeCloseTo(1400 / 13);
    expect(gap.paceGap).toBeCloseTo(600 - 2000 * (18 / 31));
    expect(goalGap(monthGoal([order("2026-10-02", 2500)], "2026-10-18", 2000))).toMatchObject({ toGo: 0, perDay: null });
  });
  it("reads typed goals", () => {
    expect(parseGoal("$2,000")).toBe(2000);
    expect(parseGoal("abc")).toBeNull();
    expect(parseGoal("0")).toBeNull();
  });
});

describe("days to ship", () => {
  it("counts from payment, or from a pre-order's release", () => {
    expect(daysToShip({ paidAt: "2026-10-01T10:00:00Z", shippedAt: "2026-10-03T10:00:00Z" })).toBe(2);
    expect(daysToShip({ paidAt: "2026-10-01T10:00:00Z" })).toBeNull();
    expect(daysToShip({ paidAt: "2026-09-01T10:00:00Z", shippedAt: "2026-10-03T10:00:00Z", preorderReleasedAt: "2026-10-02T10:00:00Z", items: [{ id: "a", preorder: true }] })).toBe(1);
  });
  it("groups by the week the parcel left", () => {
    const paid = [
      { createdAt: "2026-10-12T10:00:00Z", paidAt: "2026-10-12T10:00:00Z", shippedAt: "2026-10-13T10:00:00Z" },
      { createdAt: "2026-10-12T10:00:00Z", paidAt: "2026-10-12T10:00:00Z", shippedAt: "2026-10-15T10:00:00Z" },
      { createdAt: "2026-09-20T10:00:00Z", paidAt: "2026-09-20T10:00:00Z", shippedAt: "2026-09-24T10:00:00Z" },
    ];
    const weeks = shipWeeks(paid, "2026-10-18");
    expect(weeks).toHaveLength(12);
    expect(weeks[11]).toMatchObject({ week: "2026-10-12", median: 2, shipped: 2 });
    const head = shipHeadline(paid, "2026-10-18");
    expect(head.recent).toBe(3); // Sep 24 is inside the last 4 weeks too
    expect(head.before).toBeNull();
  });
});

describe("launchCurves", () => {
  it("draws the newest titles from their first sale, cumulative", () => {
    const paid = [
      order("2026-10-10", 0, [line("new", 2)]), order("2026-10-12", 0, [line("new", 3)]),
      order("2026-08-01", 0, [line("old", 1)]), order("2026-08-31", 0, [line("old", 4)]), order("2026-09-10", 0, [line("old", 9)]),
      order("2026-10-15", 0, [line("gift", 1, 50, { productType: "giftCard" })]),
    ];
    const curves = launchCurves(paid, [{ id: "new", title: "New Book" }], "2026-10-18", 4, 30);
    expect(curves.map(c => c.id)).toEqual(["new", "old"]);
    expect(curves[0]).toMatchObject({ title: "New Book", firstDay: "2026-10-10", daysSoFar: 8, total: 5 });
    expect(curves[0].points.slice(0, 3)).toEqual([2, 2, 5]);
    expect(curves[1]).toMatchObject({ daysSoFar: 30, total: 5 });
  });
});

describe("bookOfTheWeek", () => {
  it("picks the most copies in the last 7 days and compares with the week before", () => {
    const paid = [order("2026-10-18", 0, [line("a", 3)]), order("2026-10-13", 0, [line("b", 2), line("a", 1)]), order("2026-10-08", 0, [line("b", 5), line("a", 1)])];
    expect(bookOfTheWeek(paid, "2026-10-18")).toMatchObject({ id: "a", copies: 4, revenue: 80, before: 1, beforeRank: 2, runnerUp: "b" });
    expect(bookOfTheWeek([], "2026-10-18")).toBeNull();
  });
});

describe("signed or not", () => {
  const books = [{ id: "p", title: "Paper Moons", variants: [{ id: "s", name: "Signed edition" }, { id: "u", name: "Paperback" }] }, { id: "x", title: "Other" }];
  it("detects signed lines from the edition name", () => {
    expect(hasSignedEdition(books[0])).toBe(true);
    expect(hasSignedEdition(books[1])).toBe(false);
    expect(isSignedLine({ variantId: "s" }, books[0])).toBe(true);
    expect(isSignedLine({ variantId: "u" }, books[0])).toBe(false);
    expect(isSignedLine({ variantName: "Unsigned" }, books[0])).toBe(false);
    expect(isSignedLine({ title: "Ash (signed)" }, undefined)).toBe(true);
  });
  it("shares copies sold signed and the price difference", () => {
    const current = [order("2026-10-10", 0, [line("p", 2, 30, { variantId: "s" }), line("p", 2, 20, { variantId: "u" }), line("x", 5)])];
    const mix = signedMix(current, books);
    expect(mix.rows).toHaveLength(1);
    expect(mix.rows[0]).toMatchObject({ id: "p", signed: 2, unsigned: 2, share: 50, signedPrice: 30, unsignedPrice: 20 });
    expect(mix.premium).toBe(10);
    expect(mix.booksWithSigned).toBe(1);
  });
});
