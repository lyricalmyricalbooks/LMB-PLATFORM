import { describe, expect, it } from "vitest";
import { toastDuration } from "./toastTiming";

describe("toastDuration", () => {
  it("keeps the old minimums and grows with long messages", () => {
    expect(toastDuration("Saved.", false)).toBe(3500);
    expect(toastDuration("Saved.", true)).toBe(8000);
    expect(toastDuration("x".repeat(200), false)).toBe(12000);
    expect(toastDuration("x".repeat(200), true)).toBe(12000);
  });
});
