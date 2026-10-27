import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, MAX_BATCH, batchCodes, codesCsv, randomCode } from "./discountCodes";
import { validateDiscountDraft } from "./discountValidation";

describe("discount code generator", () => {
  it("makes valid, unambiguous codes", () => {
    for (let i = 0; i < 50; i++) {
      const code = randomCode("fall sale");
      expect(code).toMatch(/^FALLSALE-[A-Z0-9]{6}$/);
      expect(code.slice(9).split("").every(ch => CODE_ALPHABET.includes(ch))).toBe(true);
      expect(validateDiscountDraft({ code, type: "percentage", value: 10, appliesTo: "all", usageLimit: "", minOrderAmount: "", minQuantity: "" }, "2026-10-10")).toEqual({});
    }
    expect(randomCode()).toMatch(/^[A-Z0-9]{8}$/);
  });
  it("batches distinct codes, avoids existing ones and caps at 200", () => {
    let i = 0;
    const seq = (n: number) => (i++) % n;
    const codes = batchCodes("X", 5, ["X-ABCDEF"], seq);
    expect(new Set(codes).size).toBe(5);
    expect(batchCodes("X", 1000).length).toBe(MAX_BATCH);
  });
  it("writes a CSV", () => {
    expect(codesCsv(["A-1"], "=10% off")).toBe('Code,Uses,Offer\r\n"A-1",1,"\'=10% off"');
  });
});
