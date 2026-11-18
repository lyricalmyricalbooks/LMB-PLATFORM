// Support page (Donations & tips beta): the other-amount box, the amount checks, covering the fee and the giver's link.
import { describe, expect, test } from "vitest";
import { amountProblem, chargeFor, giftFromSearch, typedMinor } from "./supportRules";
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
