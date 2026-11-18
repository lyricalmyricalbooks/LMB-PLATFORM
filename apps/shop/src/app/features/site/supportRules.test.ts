// Support page (Donations & tips beta): the other-amount box, the amount checks, covering the fee and the giver's link.
import { describe, expect, test } from "vitest";
import { amountForReward, amountProblem, chargeFor, fundraiserFacts, giftFromSearch, rewardStock, storyParagraphs, typedMinor } from "./supportRules";
import { previewGivingAnswer, SAMPLE_GIFT_ID, SAMPLE_GIFT_KEY } from "./supportPreview";

describe("the other-amount box", () => {
  test("reads money as typed", () => {
    expect(typedMinor("25")).toBe(2500);
    expect(typedMinor(" $12.50 ")).toBe(1250);
    expect(typedMinor("1,000")).toBe(100000);
    expect(typedMinor("12.505")).toBeNull();
    expect(typedMinor("ten")).toBeNull();
    expect(typedMinor("")).toBeNull();
  });
  test("an amount must be chosen, at least the lowest gift and at most the highest", () => {
    expect(amountProblem(null)).toBe("supportPickAmount");
    expect(amountProblem(0)).toBe("supportPickAmount");
    expect(amountProblem(400)).toBe("supportTooSmall");
    expect(amountProblem(500)).toBe("");
    expect(amountProblem(1_000_001)).toBe("supportTooBig");
  });
});

describe("covering the card fee", () => {
  test("adds the server's own estimate, or nothing", () => {
    expect(chargeFor(2500, true)).toEqual({ feeMinor: 106, totalMinor: 2606 });
    expect(chargeFor(2500, false)).toEqual({ feeMinor: 0, totalMinor: 2500 });
  });
});

describe("the giver's own page", () => {
  test("needs a gift id and its key", () => {
    expect(giftFromSearch(`?gift=gift0001&key=${"a".repeat(48)}`)).toEqual({ id: "gift0001", key: "a".repeat(48) });
    expect(giftFromSearch("?gift=gift0001")).toBeNull();
    expect(giftFromSearch(`?gift=../x&key=${"a".repeat(48)}`)).toBeNull();
  });
});

describe("Studio's preview", () => {
  test("shows sample amounts and a paid sample gift, and never opens a card page", () => {
    const info = previewGivingAnswer("givingInfo", {}, "CAD");
    expect(info).toMatchObject({ on: true, amounts: [1000, 2500, 5000, 10000], otherAmount: true, coverFee: true, honour: true });
    const start = previewGivingAnswer("giftStart", { amountMinor: 2500, coverFee: true, giver: { name: "Ada Reader" } }, "CAD");
    expect(start).toEqual({ giftId: SAMPLE_GIFT_ID, key: SAMPLE_GIFT_KEY, preview: true });
    expect(previewGivingAnswer("giftView", { giftId: SAMPLE_GIFT_ID }, "CAD").gift).toMatchObject({ status: "paid", amountMinor: 2500, feeMinor: 106, name: "Ada Reader" });
  });
});

describe("the fundraiser on the Support page", () => {
  const f = { id: "f1", title: "Reprint", story: "", goalMinor: 300000, raisedMinor: 187500, supporters: 42, endsOn: "2026-11-20", state: "live" as const, wall: [], showWall: true };
  test("supporters and days left as copy keys", () => {
    expect(fundraiserFacts(f, "2026-11-18")).toEqual({ bar: 62, reached: false, supporters: ["supportFundSupporters", { count: 42 }], when: ["supportFundDaysLeft", { days: 3 }] });
    expect(fundraiserFacts({ ...f, supporters: 1, endsOn: "2026-11-18" }, "2026-11-18")).toMatchObject({ supporters: ["supportFundOneSupporter", {}], when: ["supportFundLastDay", {}] });
    expect(fundraiserFacts({ ...f, raisedMinor: 300000 }, "2026-11-18")).toMatchObject({ bar: 100, reached: true });
  });
  test("a blank line starts a new paragraph", () => {
    expect(storyParagraphs("One\nstill one\n\n  Two  \n\n\n")).toEqual(["One\nstill one", "Two"]);
    expect(storyParagraphs("")).toEqual([]);
  });
  test("Studio's preview has no fundraiser unless asked", () => {
    expect(previewGivingAnswer("givingInfo").fundraiser).toBeUndefined();
  });
});

describe("fundraiser rewards on the Support page (G2b)", () => {
  test("how many are left reads in plain words", () => {
    expect(rewardStock({ left: null, gone: false })).toBe(null);
    expect(rewardStock({ left: 1, gone: false })).toEqual(["supportRewardLastOne", {}]);
    expect(rewardStock({ left: 4, gone: false })).toEqual(["supportRewardLeft", { count: 4 }]);
    expect(rewardStock({ left: 0, gone: true })).toEqual(["supportRewardGone", {}]);
  });
  test("picking a reward raises a smaller gift to its smallest, using a suggested amount when one fits", () => {
    expect(amountForReward(5000, { minMinor: 2500 }, [1000, 2500])).toBe(null);
    expect(amountForReward(1000, { minMinor: 2500 }, [1000, 2500])).toEqual({ picked: 2500 });
    expect(amountForReward(null, { minMinor: 7500 }, [1000, 2500])).toEqual({ picked: "other", typed: "75" });
    expect(amountForReward(1000, { minMinor: 1250 }, [])).toEqual({ picked: "other", typed: "12.50" });
  });
});

describe("fundraiser rewards on the Support page (G2b)", () => {
  test("how many are left reads in plain words", () => {
    expect(rewardStock({ left: null, gone: false })).toBe(null);
    expect(rewardStock({ left: 1, gone: false })).toEqual(["supportRewardLastOne", {}]);
    expect(rewardStock({ left: 4, gone: false })).toEqual(["supportRewardLeft", { count: 4 }]);
    expect(rewardStock({ left: 0, gone: true })).toEqual(["supportRewardGone", {}]);
  });
  test("picking a reward raises a smaller gift to its smallest, using a suggested amount when one fits", () => {
    expect(amountForReward(5000, { minMinor: 2500 }, [1000, 2500])).toBe(null);
    expect(amountForReward(1000, { minMinor: 2500 }, [1000, 2500])).toEqual({ picked: 2500 });
    expect(amountForReward(null, { minMinor: 7500 }, [1000, 2500])).toEqual({ picked: "other", typed: "75" });
    expect(amountForReward(1000, { minMinor: 1250 }, [])).toEqual({ picked: "other", typed: "12.50" });
  });
});
