// Commission that rises in a good month (plan 4, 4.4). Run against the shop's copy and the server's.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import * as shop from "./bookingTimes";

const server = createRequire(import.meta.url)("../../functions/shared/bookingTimes.js") as typeof shop;

describe.each([["shop", shop], ["server", server]] as const)("commission steps (%s copy)", (_name, t) => {
  const steps = [{ overMinor: 300_000, percent: 50 }];

  test("each share is only on the part above its amount", () => {
    // $4,000: 40% of the first $3,000 is $1,200, then 50% of the last $1,000 is $500.
    expect(t.commissionFor(400_000, 40, steps)).toBe(170_000);
    expect(t.commissionFor(300_000, 40, steps)).toBe(120_000);
    expect(t.commissionFor(100_000, 40, steps)).toBe(40_000);
    expect(t.commissionFor(100_000, 40)).toBe(40_000);
    expect(t.commissionFor(800_000, 40, [...steps, { overMinor: 600_000, percent: 60 }])).toBe(120_000 + 150_000 + 120_000);
  });

  test("nothing for no takings, a refunded month or no share", () => {
    expect(t.commissionFor(0, 40, steps)).toBe(0);
    expect(t.commissionFor(-5_000, 40, steps)).toBe(0);
    expect(t.commissionFor(400_000, 0, steps)).toBe(0);
  });

  test("rounds once, to the cent", () => {
    expect(t.commissionFor(333, 33.5)).toBe(112);
    expect(t.commissionFor(300_333, 40, steps)).toBe(120_000 + 167);
  });

  test("steps as typed: rising amounts, a real share, four at most", () => {
    expect(t.cleanCommissionSteps([{ overMinor: 300_000, percent: 50 }, { overMinor: 200_000, percent: 60 }, { overMinor: 0, percent: 70 }, { overMinor: 400_000, percent: 101 }, "x"]))
      .toEqual([{ overMinor: 300_000, percent: 50 }]);
    const five = [1, 2, 3, 4, 5].map((n) => ({ overMinor: n * 100_000, percent: 40 + n }));
    expect(t.cleanCommissionSteps(five)).toHaveLength(t.MAX_COMMISSION_STEPS);
    expect(t.cleanCommissionSteps(null)).toEqual([]);
    expect(t.cleanCommissionSteps([{ overMinor: t.MAX_STEP_MINOR + 1, percent: 50 }])).toEqual([]);
  });

  test("a person keeps steps only with a share", () => {
    const base = { id: "ana", name: "Ana", active: true, serviceIds: [], ownHours: false, hours: t.DEFAULT_BOOKING_SETTINGS.hours, daysOff: [] };
    expect(t.cleanStaff([{ ...base, commissionPercent: 40, commissionSteps: steps }])[0].commissionSteps).toEqual(steps);
    expect(t.cleanStaff([{ ...base, commissionSteps: steps }])[0].commissionSteps).toBeUndefined();
  });

  test("in plain words", () => {
    expect(t.commissionStepsText(40, steps)).toBe("40% up to $3,000 a month, then 50%.");
    expect(t.commissionStepsText(40, [...steps, { overMinor: 650_050, percent: 60 }], "CA$")).toBe("40% up to CA$3,000 a month, then 50% up to CA$6,500.5, then 60%.");
    expect(t.commissionStepsText(40, [])).toBe("40% of the month.");
  });
});
