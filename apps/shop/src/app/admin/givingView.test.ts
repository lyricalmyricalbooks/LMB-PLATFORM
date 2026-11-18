// Donations & tips (beta): the admin page's amount box, suggested amounts and the blocked-tries line.
import { describe, expect, test } from "vitest";
import { amountFromText, blockedLine, honourText, withAmount } from "./givingView";

const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;

describe("typing an amount", () => {
  test("dollars become cents, with or without a sign", () => {
    expect(amountFromText("25", money)).toEqual({ minor: 2500 });
    expect(amountFromText(" $12.50 ", money)).toEqual({ minor: 1250 });
    expect(amountFromText("1,000", money)).toEqual({ minor: 100000 });
  });
  test("below the lowest gift, above the highest or not a number is said plainly", () => {
    expect(amountFromText("2", money)).toEqual({ problem: "The lowest gift is $5.00." });
    expect(amountFromText("20000", money)).toEqual({ problem: "The highest gift is $10000.00." });
    expect(amountFromText("ten", money)).toEqual({ problem: "Type an amount, like 25 or 12.50." });
  });
});

describe("the suggested amounts", () => {
  test("stay unique, smallest first, six at most", () => {
    expect(withAmount([1000, 5000], 2500)).toEqual([1000, 2500, 5000]);
    expect(withAmount([1000], 1000)).toEqual({ problem: "That amount is already on the list." });
    expect(withAmount([500, 1000, 1500, 2000, 2500, 3000], 4000)).toEqual({ problem: "Up to 6 amounts. Remove one first." });
  });
});

describe("words on the page", () => {
  test("the honour line and the blocked tries", () => {
    expect(honourText({ honour: { kind: "memory", name: "Grace" } })).toBe("In memory of Grace");
    expect(honourText({ honour: null })).toBe("");
    expect(blockedLine({ tooSmall: 0, tooMany: 0, bot: 0, total: 0 })).toBe("Nothing suspicious in the last 30 days.");
    expect(blockedLine({ tooSmall: 2, tooMany: 0, bot: 5, total: 7 })).toBe("2 under the lowest gift, 5 from bots, in the last 30 days.");
  });
});

describe("fundraisers on the admin page", () => {
  test("the goal box takes dollars and keeps to the limits", async () => {
    const { goalFromText } = await import("./givingView");
    expect(goalFromText("3000")).toEqual({ minor: 300000 });
    expect(goalFromText("$1,500.50")).toEqual({ minor: 150050 });
    expect(goalFromText("99")).toHaveProperty("problem");
    expect(goalFromText("lots")).toHaveProperty("problem");
    expect(goalFromText("2000000")).toHaveProperty("problem");
  });
  test("the words under the bar", async () => {
    const { fundraiserLines } = await import("./givingView");
    const f = { raisedMinor: 187500, goalMinor: 300000, endsOn: "2026-11-20", state: "live" as const };
    expect(fundraiserLines(f, money, "2026-11-18")).toEqual({ raised: "$1875.00 of $3000.00", percent: "62% of the goal", when: "3 days left" });
    expect(fundraiserLines({ ...f, endsOn: "2026-11-18" }, money, "2026-11-18").when).toBe("Last day today");
    expect(fundraiserLines({ ...f, state: "ended" }, money, "2026-11-18").when).toBe("Ended");
    expect(fundraiserLines({ ...f, state: "draft" }, money, "2026-11-18").when).toMatch(/^Would run to /);
  });
});
