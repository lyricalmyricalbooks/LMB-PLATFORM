import { describe, expect, it } from "vitest";
import { greeting, todayFigures } from "./HomeToday";
import { shopDayKey } from "../../lib/shopDay";

const NOON = Date.parse("2026-11-10T17:00:00Z"); // 12:00 in Toronto
const order = (total: number, at: number) => ({ id: String(total), paymentStatus: "paid", total, createdAt: new Date(at).toISOString(), items: [] });

describe("Home", () => {
  it("greets by the shop's clock and first name, never with an email", () => {
    expect(greeting("Julian Smith", Date.parse("2026-11-10T14:00:00Z"))).toBe("Good morning, Julian");
    expect(greeting("Julian", NOON)).toBe("Good afternoon, Julian");
    expect(greeting("owner@example.com", Date.parse("2026-11-11T01:00:00Z"))).toBe("Good evening");
  });

  it("adds the till's takings in the shop's currency to today's website sales, today the last bar", () => {
    const fair = { day: shopDayKey(NOON), fair: "Harbour Fair", sales: 2, units: 3, totals: [{ cur: "CAD", amount: 30 }, { cur: "USD", amount: 10 }], methods: [], titles: [], upload: { tone: "ok", text: "Uploaded" } };
    const f = todayFigures([order(20, NOON), order(5, NOON - 86_400_000), { ...order(99, NOON), isTest: true }] as any, fair, NOON);
    expect(f.total).toBe(50);
    expect(f.siteSales).toBe(1);
    expect(f.tillSales).toBe(2);
    expect(f.bars).toHaveLength(12);
    expect(f.bars.slice(-2)).toEqual([5, 50]);
  });
});
