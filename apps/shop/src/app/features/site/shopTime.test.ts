import { afterEach, describe, expect, it, vi } from "vitest";
import { isNonexistentTorontoTime, isoToTorontoLocal, shopInstant, torontoLocalToIso } from "./shopTime";
import { sectionInWindow } from "../../components/sectionRender";

afterEach(() => vi.useRealTimers());

describe("shop time (Toronto) for zone-less values", () => {
  it("reads datetime-local and date-only values as Toronto time, and zoned values as written", () => {
    expect(shopInstant("2026-10-31T23:59")).toBe(Date.parse("2026-11-01T03:59:00.000Z")); // EDT
    expect(shopInstant("2026-12-01T09:00")).toBe(Date.parse("2026-12-01T14:00:00.000Z")); // EST
    expect(shopInstant("2026-12-01")).toBe(Date.parse("2026-12-01T05:00:00.000Z"));
    expect(shopInstant("2026-12-01T09:00:30")).toBe(Date.parse("2026-12-01T14:00:00.000Z"));
    expect(shopInstant("2026-12-01T09:00:00Z")).toBe(Date.parse("2026-12-01T09:00:00Z"));
    expect(shopInstant("2026-12-01T09:00:00-08:00")).toBe(Date.parse("2026-12-01T17:00:00Z"));
    expect(Number.isNaN(shopInstant("soon"))).toBe(true);
    expect(Number.isNaN(shopInstant(""))).toBe(true);
  });
  it("round-trips and flags the skipped spring-forward hour", () => {
    expect(isoToTorontoLocal(torontoLocalToIso("2026-10-31T23:59")!)).toBe("2026-10-31T23:59");
    expect(isNonexistentTorontoTime("2027-03-14T02:30")).toBe(true);
    expect(isNonexistentTorontoTime("2027-03-14T03:30")).toBe(false);
  });
});

describe("a section's Show from / Show until window follows Toronto time (#149)", () => {
  const section = (settings: any) => ({ id: "s", type: "HeroSection", settings });
  const at = (iso: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)); };

  it("ends at 23:59 Toronto time, not 23:59 in the viewer's or the build machine's zone", () => {
    const s = section({ showUntil: "2026-10-31T23:59" });
    at("2026-11-01T03:30:00Z"); // 23:30 in Toronto, 03:30 UTC on the 1st
    expect(sectionInWindow(s)).toBe(true);
    at("2026-11-01T04:00:00Z"); // 00:00 on 1 Nov in Toronto
    expect(sectionInWindow(s)).toBe(false);
  });
  it("starts at the Toronto wall-clock time", () => {
    const s = section({ showFrom: "2026-12-01T09:00" });
    at("2026-12-01T13:59:00Z"); // 08:59 in Toronto
    expect(sectionInWindow(s)).toBe(false);
    at("2026-12-01T14:00:00Z");
    expect(sectionInWindow(s)).toBe(true);
  });
  it("shows a section with no window, and ignores a value that isn't a date", () => {
    at("2026-12-01T14:00:00Z");
    expect(sectionInWindow(section({}))).toBe(true);
    expect(sectionInWindow(section({ showFrom: "soon", showUntil: "later" }))).toBe(true);
  });
});
