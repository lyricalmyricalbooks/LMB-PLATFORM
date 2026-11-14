import { describe, expect, it } from "vitest";
import { firstOpenDay, groupTimes, lengthText, manageFromSearch, monthLabel, pageDays, pageStep, paysUpFront } from "./bookTimeRules";

const ZONE = "America/Toronto";

describe("Book a time page rules", () => {
  it("shows a week at a time, never past the last bookable day", () => {
    expect(pageDays("2026-11-16", "2026-12-31")).toHaveLength(7);
    expect(pageDays("2026-11-16", "2026-11-18")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
  });
  it("moves a page back and forward within the bookable days", () => {
    expect(pageStep("2026-11-16", "2026-11-16", "2026-12-31", -1)).toBeNull();
    expect(pageStep("2026-11-20", "2026-11-16", "2026-12-31", -1)).toBe("2026-11-16");
    expect(pageStep("2026-11-23", "2026-11-16", "2026-12-31", -1)).toBe("2026-11-16");
    expect(pageStep("2026-11-16", "2026-11-16", "2026-12-31", 1)).toBe("2026-11-23");
    expect(pageStep("2026-11-16", "2026-11-16", "2026-11-20", 1)).toBeNull();
  });
  it("opens on the first day with a free time", () => {
    expect(firstOpenDay(["a", "b", "c"], { a: [], b: ["x"] })).toBe("b");
    expect(firstOpenDay(["a", "b"], {})).toBe("a");
  });
  it("groups times by the shop's morning, afternoon and evening", () => {
    const groups = groupTimes(["2026-11-17T15:00:00.000Z", "2026-11-17T18:30:00.000Z", "2026-11-17T22:00:00.000Z"], ZONE);
    expect(groups.map((g) => [g.group, g.times.length])).toEqual([["morning", 1], ["afternoon", 1], ["evening", 1]]);
    expect(groupTimes([], ZONE)).toEqual([]);
  });
  it("says how long and how it's paid", () => {
    expect(lengthText(45)).toBe("45 min");
    expect(lengthText(60)).toBe("1 h");
    expect(lengthText(90)).toBe("1 h 30 min");
    expect(paysUpFront({ payment: "full", priceMinor: 0 })).toBe(false);
    expect(paysUpFront({ payment: "full", priceMinor: 2500 })).toBe(true);
  });
  it("names the month or months shown", () => {
    expect(monthLabel(["2026-11-16", "2026-11-22"])).toMatch(/November 2026/);
    expect(monthLabel(["2026-11-30", "2026-12-06"])).toMatch(/Nov.*Dec.*2026/);
  });
  it("reads only a well-formed manage link", () => {
    const key = "a".repeat(48);
    expect(manageFromSearch(`?booking=abc12345&key=${key}`)).toEqual({ id: "abc12345", key });
    expect(manageFromSearch(`?booking=abc12345&key=short`)).toBeNull();
    expect(manageFromSearch("")).toBeNull();
  });
});
