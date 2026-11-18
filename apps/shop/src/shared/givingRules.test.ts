// Donations & tips (beta): the settings always usable, the $5 lowest gift, the card fee estimate and the giver's details.
import { describe, expect, test } from "vitest";
import { cleanGiver, cleanGivingSettings, coverFeeMinor, DEFAULT_AMOUNTS, giftAmountProblem, giftCharge, giverShown, MIN_GIFT_MINOR, startingGivingSettings } from "./givingRules";

describe("the owner's settings", () => {
  test("nothing saved gives the starting amounts with every choice on", () => {
    expect(cleanGivingSettings(null)).toEqual({ ...startingGivingSettings(), amounts: [] });
    expect(cleanGivingSettings({ otherAmount: false }).amounts).toEqual([...DEFAULT_AMOUNTS]);
  });
  test("amounts are whole cents between the lowest and highest gift, unique, smallest first, at most six", () => {
    expect(cleanGivingSettings({ amounts: [5000, "1000", 200, 1000, 2_000_000, 2500, 3000, 4000, 6000, 7000] }).amounts).toEqual([1000, 2500, 3000, 4000, 5000, 6000]);
  });
  test("the thank-you words keep paragraphs and lose extra space", () => {
    expect(cleanGivingSettings({ thanks: "  Thank you!\r\n\r\n\r\nIt  means a lot. " }).thanks).toBe("Thank you!\n\nIt means a lot.");
  });
});

describe("what a gift may be", () => {
  const s = cleanGivingSettings({ amounts: [1000, 2500] });
  test("five dollars is the lowest, ten thousand the highest", () => {
    expect(giftAmountProblem(MIN_GIFT_MINOR - 1, s)).toEqual({ code: "tooSmall" });
    expect(giftAmountProblem(MIN_GIFT_MINOR, s)).toBeNull();
    expect(giftAmountProblem(1_000_001, s)).toEqual({ code: "tooBig" });
    expect(giftAmountProblem("abc", s)).toEqual({ code: "amount" });
    expect(giftAmountProblem(1250, s)).toBeNull();
  });
  test("with no other amount, only the suggested ones", () => {
    const fixed = cleanGivingSettings({ amounts: [1000, 2500], otherAmount: false });
    expect(giftAmountProblem(1000, fixed)).toBeNull();
    expect(giftAmountProblem(1500, fixed)).toEqual({ code: "amount" });
  });
});

describe("covering the card fee", () => {
  test("the shop keeps the whole gift after the usual card rate", () => {
    const fee = coverFeeMinor(2500);
    expect(fee).toBe(106);
    const charged = 2500 + fee;
    expect(charged - Math.round(charged * 0.029) - 30).toBeGreaterThanOrEqual(2500);
  });
  test("only when the giver asks and the shop offers it", () => {
    const on = cleanGivingSettings({});
    expect(giftCharge(2500, true, on)).toEqual({ amountMinor: 2500, feeMinor: 106, chargedMinor: 2606 });
    expect(giftCharge(2500, false, on).feeMinor).toBe(0);
    expect(giftCharge(2500, true, cleanGivingSettings({ coverFee: false })).feeMinor).toBe(0);
  });
});

describe("the giver", () => {
  const s = cleanGivingSettings({});
  test("needs a name and an email", () => {
    expect(cleanGiver({ email: "a@example.com" }, s)).toMatchObject({ code: "name" });
    expect(cleanGiver({ name: "Ada", email: "nope" }, s)).toMatchObject({ code: "email" });
  });
  test("in honour or memory of someone needs their name, and only when the shop offers it", () => {
    expect(cleanGiver({ name: "Ada", email: "A@Example.com", honour: { kind: "memory", name: "" } }, s)).toMatchObject({ code: "honour" });
    expect(cleanGiver({ name: "Ada Reader", email: "A@Example.com", anonymous: true, honour: { kind: "memory", name: " Grace " }, note: "For the  press" }, s))
      .toEqual({ name: "Ada Reader", email: "a@example.com", anonymous: true, honour: { kind: "memory", name: "Grace" }, note: "For the press" });
    expect(cleanGiver({ name: "Ada", email: "a@example.com", honour: { kind: "memory", name: "Grace" } }, cleanGivingSettings({ honour: false }))).toMatchObject({ honour: null });
  });
  test("shown to others by first name, or Anonymous", () => {
    expect(giverShown({ name: "Ada Reader", anonymous: false })).toBe("Ada");
    expect(giverShown({ name: "Ada Reader", anonymous: true })).toBe("Anonymous");
  });
});
