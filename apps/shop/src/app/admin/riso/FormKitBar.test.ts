import { describe, expect, it } from "vitest";
import { hiddenBehindBar } from "./FormKit";

describe("hiddenBehindBar", () => {
  const bar = { top: 760 };
  it("leaves a field above the bar alone", () => {
    expect(hiddenBehindBar({ top: 400, bottom: 460 }, bar)).toBe(0);
  });
  it("scrolls a field the bar covers until it sits above the bar", () => {
    expect(hiddenBehindBar({ top: 720, bottom: 764 }, bar)).toBe(20);
  });
  it("scrolls a field in the strip below the bar too", () => {
    expect(hiddenBehindBar({ top: 864, bottom: 924 }, bar)).toBe(180);
  });
  it("shows only the first lines of a tall box", () => {
    expect(hiddenBehindBar({ top: 700, bottom: 1400 }, bar)).toBe(20);
  });
});
