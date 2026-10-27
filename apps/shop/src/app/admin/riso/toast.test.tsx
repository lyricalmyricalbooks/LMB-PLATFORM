import { describe, expect, it } from "vitest";
import { toastLifetime } from "./components";

describe("toastLifetime", () => {
  it("keeps problems up longest and plain confirmations shortest", () => {
    expect(toastLifetime({ tone: "err" })).toBe(10000);
    expect(toastLifetime({ tone: "warn" })).toBe(10000);
    expect(toastLifetime({ onAction: () => {} })).toBe(8000);
    expect(toastLifetime()).toBe(4000);
  });
});
