// Loyalty points (plan 4, 5.5). Run against the shop's copy and the server's.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import * as shop from "./loyalty";

const server = createRequire(import.meta.url)("../../functions/shared/loyalty.js") as typeof shop;

describe.each([["shop", shop], ["server", server]] as const)("loyalty points (%s copy)", (_name, l) => {
  const s = l.cleanLoyalty({ on: true, perDollar: 2, perVisit: 10, rewardPoints: 200, bonusWeeks: [{ from: "2026-12-01", to: "2026-12-07", times: 3 }] });

  test("whole dollars earn, plus the visit bonus, times the bonus week", () => {
    expect(l.visitPoints(s, 4599, "2026-11-20")).toBe(45 * 2 + 10);
    expect(l.visitPoints(s, 4599, "2026-12-03")).toBe((45 * 2 + 10) * 3);
    expect(l.orderPoints(s, 4599, "2026-11-20")).toBe(90);
    expect(l.orderPoints({ ...s, onOrders: false }, 4599, "2026-11-20")).toBe(0);
    expect(l.visitPoints({ ...s, on: false }, 4599, "2026-11-20")).toBe(0);
  });

  test("rewards come out at the level, three at most at once", () => {
    expect(l.rewardsDue(s, 199)).toEqual({ rewards: 0, left: 199 });
    expect(l.rewardsDue(s, 450)).toEqual({ rewards: 2, left: 50 });
    expect(l.rewardsDue(s, 5000)).toEqual({ rewards: 3, left: 4400 });
    expect(l.pointsToNext(s, 150)).toBe(50);
    expect(l.pointsToNext(s, 250)).toBe(0);
  });

  test("bad settings fall back; a hand-made change is a whole number that isn't zero", () => {
    expect(l.cleanLoyalty({})).toEqual(l.LOYALTY_DEFAULTS);
    expect(l.cleanBonusWeeks([{ from: "2026-01-01", to: "2026-04-01" }, { from: "2026-05-02", to: "2026-05-01" }])).toEqual([]);
    expect(l.cleanAdjust("12")).toBe(12);
    expect(l.cleanAdjust(1.5)).toBeNull();
    expect(l.cleanAdjust(0)).toBeNull();
    expect(l.rewardCode(() => 0)).toBe("THANKS-AAAAAA");
  });
});
