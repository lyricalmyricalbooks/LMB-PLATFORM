import { describe, expect, it } from "vitest";
import { figureSeries, orderPill } from "./OverviewFiguresViz";
import { resolveRange } from "./overviewRange";

const NOW = Date.parse("2026-10-18T16:00:00Z");
const paid = [
  { createdAt: "2026-10-17T16:00:00Z", total: 40, items: [{ id: "a", quantity: 2 }] },
  { createdAt: "2026-10-18T15:00:00Z", total: 20, items: [{ id: "a", quantity: 1 }] },
  { createdAt: "2026-09-10T15:00:00Z", total: 30, items: [{ id: "a", quantity: 1 }] },
];

describe("Key figure lines", () => {
  it("gives one point per day with the period before alongside", () => {
    const s = figureSeries(paid, resolveRange("7d", { now: NOW }));
    expect(s.revenue.cur).toHaveLength(7);
    expect(s.revenue.cur.slice(-2)).toEqual([40, 20]);
    expect(s.orders.cur.reduce((a, b) => (a || 0) + (b || 0), 0)).toBe(2);
    expect(s.aov.cur[0]).toBeNull();
    expect(s.visitors.cur.every(v => v === 0)).toBe(true);
    expect(s.conversion.cur.every(v => v === null)).toBe(true);
  });

  it("uses the last 7 days for Today and weeks for long ranges", () => {
    expect(figureSeries(paid, resolveRange("today", { now: NOW })).revenue.cur).toHaveLength(7);
    expect(figureSeries(paid, resolveRange("90d", { now: NOW })).revenue.cur.length).toBeLessThanOrEqual(15);
  });

  it("groups ranges over two weeks by week", () => {
    const n = figureSeries(paid, resolveRange("30d", { now: NOW })).revenue.cur.length;
    expect(n).toBeGreaterThanOrEqual(5); expect(n).toBeLessThanOrEqual(6);
  });
});

describe("Newest order pills", () => {
  it("are glyph + word in ink, colour only when something needs looking at", () => {
    expect(orderPill("Paid · to send")).toEqual({ tone: "neutral", glyph: "●", word: "To ship" });
    expect(orderPill("Shipped").tone).toBe("neutral");
    expect(orderPill("Refunded").tone).toBe("warning");
    expect(orderPill("Something new")).toEqual({ tone: "neutral", glyph: "○", word: "Something new" });
  });
});
