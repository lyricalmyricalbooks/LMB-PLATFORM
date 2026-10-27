import { describe, expect, it } from "vitest";
import { nextHeaderHidden } from "./headerReveal";

const base = { enabled: true, hidden: false, y: 600, lastY: 500, headerBottom: 160, busy: false };

describe("nextHeaderHidden", () => {
  it("hides while scrolling down past the header", () => {
    expect(nextHeaderHidden(base)).toBe(true);
  });
  it("comes back on a scroll up", () => {
    expect(nextHeaderHidden({ ...base, hidden: true, y: 480, lastY: 500 })).toBe(false);
  });
  it("ignores tiny movements", () => {
    expect(nextHeaderHidden({ ...base, y: 503 })).toBe(false);
    expect(nextHeaderHidden({ ...base, hidden: true, y: 497 })).toBe(true);
  });
  it("never hides near the top, when off, or while the header is in use", () => {
    expect(nextHeaderHidden({ ...base, y: 150, lastY: 100 })).toBe(false);
    expect(nextHeaderHidden({ ...base, enabled: false })).toBe(false);
    expect(nextHeaderHidden({ ...base, hidden: true, busy: true })).toBe(false);
  });
});
