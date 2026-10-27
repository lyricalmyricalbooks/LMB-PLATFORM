import { describe, expect, it } from "vitest";
import { discountState } from "./discountState";

describe("discountState", () => {
  const now = "2026-09-29";
  it("is active when enabled, unexpired and under its limit", () => {
    expect(discountState({ isActive: true, expiryDate: "2026-12-01", usageLimit: 10, usageCount: 3 }, now).key).toBe("active");
  });
  it("expires after the expiry date but not on it", () => {
    expect(discountState({ isActive: true, expiryDate: "2026-09-28" }, now).key).toBe("expired");
    expect(discountState({ isActive: true, expiryDate: "2026-09-29" }, now).key).toBe("active");
  });
  it("is scheduled until its start date, then active", () => {
    expect(discountState({ isActive: true, startDate: "2026-10-01" }, now).key).toBe("scheduled");
    expect(discountState({ isActive: true, startDate: "2026-09-29" }, now).key).toBe("active");
  });
  it("is exhausted at its usage limit", () => {
    expect(discountState({ isActive: true, usageLimit: 5, usageCount: 5 }, now).key).toBe("exhausted");
  });
  it("is paused when disabled, and expiry outranks paused", () => {
    expect(discountState({ isActive: false }, now).key).toBe("paused");
    expect(discountState({ isActive: false, expiryDate: "2020-01-01" }, now).key).toBe("expired");
  });
  it("treats a missing usage limit as unlimited", () => {
    expect(discountState({ isActive: true, usageCount: 9999 }, now).key).toBe("active");
  });
});
