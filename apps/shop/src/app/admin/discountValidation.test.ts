import { describe, expect, it } from "vitest";
import { draftFrom, validateDiscountDraft } from "./discountValidation";

const valid = { code: "SAVE10", type: "percentage", value: 10, appliesTo: "all", expiryDate: "", usageLimit: "", minOrderAmount: "", minQuantity: "" };

describe("validateDiscountDraft", () => {
  it("accepts a safe basic promotion", () => expect(validateDiscountDraft(valid, "2026-09-29")).toEqual({}));
  it("rejects malformed codes and expired dates", () => expect(validateDiscountDraft({ ...valid, code: "x!", expiryDate: "2026-09-28" }, "2026-09-29")).toMatchObject({ code: expect.any(String), expiryDate: expect.any(String) }));
  it("requires integer limits and non-negative thresholds", () => expect(validateDiscountDraft({ ...valid, usageLimit: "1.5", minQuantity: "2.2", minOrderAmount: -1 })).toMatchObject({ usageLimit: expect.any(String), minQuantity: expect.any(String), minOrderAmount: expect.any(String) }));
  it("validates BOGO and ordered tier structures", () => {
    expect(validateDiscountDraft({ ...valid, type: "bogo", buyQuantity: 0, getQuantity: 1, getDiscountValue: 101 })).toHaveProperty("bogo");
    expect(validateDiscountDraft({ ...valid, type: "tiered", tiers: [{ minSpend: 50, value: 10 }, { minSpend: 20, value: 5 }] })).toHaveProperty("tiers");
    expect(validateDiscountDraft({ ...valid, type: "tiered", tiers: [{ minSpend: 20, value: 150, type: "percentage" }] })).toHaveProperty("tiers");
    expect(validateDiscountDraft({ ...valid, type: "tiered", tiers: [{ minSpend: 20, value: 150, type: "fixed" }] })).not.toHaveProperty("tiers");
  });
  it("rejects an end date before the start date", () => expect(validateDiscountDraft({ ...valid, startDate: "2026-12-10", expiryDate: "2026-12-01" }, "2026-09-29")).toMatchObject({ expiryDate: expect.any(String) }));
});

describe("maximum discount cap", () => {
  it("accepts blank or positive caps and rejects zero or negative", () => {
    expect(validateDiscountDraft({ ...valid, maxDiscountAmount: "" }, "2026-01-01").maxDiscountAmount).toBeUndefined();
    expect(validateDiscountDraft({ ...valid, maxDiscountAmount: "15" }, "2026-01-01").maxDiscountAmount).toBeUndefined();
    expect(validateDiscountDraft({ ...valid, maxDiscountAmount: "0" }, "2026-01-01").maxDiscountAmount).toBeTruthy();
    expect(validateDiscountDraft({ ...valid, maxDiscountAmount: "-3" }, "2026-01-01").maxDiscountAmount).toBeTruthy();
  });
});

describe("duplicate codes", () => {
  it("refuses a code another discount already uses, whatever its case", () => {
    expect(validateDiscountDraft(valid, "2026-10-08", ["save10 "]).code).toMatch(/already uses/);
    expect(validateDiscountDraft(valid, "2026-10-08", ["OTHER"]).code).toBeUndefined();
  });
});

describe("automatic offers and free gifts", () => {
  const auto = { ...valid, code: "", method: "automatic", title: "Spring sale" };
  it("needs a title instead of a code and skips the duplicate-code check", () => {
    expect(validateDiscountDraft(auto, "2026-10-08", ["", "SAVE10"])).toEqual({});
    expect(validateDiscountDraft({ ...auto, title: " " }, "2026-10-08").title).toBeTruthy();
    expect(validateDiscountDraft({ ...auto, title: "x".repeat(61) }, "2026-10-08").title).toBeTruthy();
  });
  it("ignores automatic offers' blank codes when checking a code for duplicates", () => {
    expect(validateDiscountDraft(valid, "2026-10-08", ["", ""]).code).toBeUndefined();
  });
  it("only allows a free gift as an automatic offer with a book (and edition) chosen", () => {
    expect(validateDiscountDraft({ ...valid, type: "gift", giftBookId: "b" }, "2026-10-08").gift).toMatch(/automatic offer/);
    expect(validateDiscountDraft({ ...auto, type: "gift" }, "2026-10-08").gift).toMatch(/Choose the book/);
    expect(validateDiscountDraft({ ...auto, type: "gift", giftBookId: "b" }, "2026-10-08", [], { variants: [{ id: "pb" }] }).gift).toMatch(/edition/);
    expect(validateDiscountDraft({ ...auto, type: "gift", giftBookId: "b", giftVariantId: "pb" }, "2026-10-08", [], { variants: [{ id: "pb" }] })).toEqual({});
  });
});

describe("editing expired codes", () => {
  it("allows keeping a past expiry that was already saved, but not setting a new past one", () => {
    expect(validateDiscountDraft({ ...valid, expiryDate: "2026-01-01" }, "2026-10-09", [], undefined, "2026-01-01").expiryDate).toBeUndefined();
    expect(validateDiscountDraft({ ...valid, expiryDate: "2026-02-01" }, "2026-10-09", [], undefined, "2026-01-01").expiryDate).toBeTruthy();
  });
});

describe("draftFrom", () => {
  it("lets a saved code with no usage limit be edited", () => {
    const saved = { id: "d1", ...valid, usageLimit: null, minOrderAmount: null, minQuantity: null, description: null, method: "code" };
    const form = draftFrom(saved, valid);
    expect(form.usageLimit).toBe("");
    expect(form.description).toBeUndefined();
    expect(validateDiscountDraft(form, "2026-09-29")).toEqual({});
  });
});

