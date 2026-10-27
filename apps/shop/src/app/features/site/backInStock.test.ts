import { describe, expect, it } from "vitest";
import { isValidAlertEmail } from "./BackInStockForm";
import { COPY_SCHEMA } from "./storeCopy";

describe("back-in-stock signup", () => {
  it("accepts normal emails and rejects junk", () => {
    expect(isValidAlertEmail("a@b.co")).toBe(true);
    expect(isValidAlertEmail(" reader@example.com ")).toBe(true);
    expect(isValidAlertEmail("nope")).toBe(false);
    expect(isValidAlertEmail("a@b")).toBe(false);
    expect(isValidAlertEmail("a b@c.com")).toBe(false);
  });
  it("has editable copy for every string", () => {
    const keys = COPY_SCHEMA.flatMap((g) => g.fields.map((f) => f.key));
    for (const k of ["alertHeading", "alertPlaceholder", "alertButton", "alertSuccess", "alertError"]) {
      expect(keys).toContain(k);
    }
  });
});
