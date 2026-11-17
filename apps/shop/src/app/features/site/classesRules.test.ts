import { describe, expect, it } from "vitest";
import { dayHeading, placesState, signUpPath, timetableDays, weekFromSearch, weekRangeText, weekStep, type ClassView } from "./classesRules";

const wheel: ClassView = { id: "wheel", name: "Wheel throwing", description: "", minutes: 120, priceMinor: 5500, payment: "full", location: "Studio", places: 8 };
const glaze: ClassView = { id: "glaze", name: "Glazing", description: "", minutes: 60, priceMinor: 0, payment: "free", location: "", places: 6 };

describe("the week's classes", () => {
  it("lays seven days out from the first, each with its classes earliest first", () => {
    const days = timetableDays({ from: "2026-11-16", classes: [wheel, glaze], sessions: [
      { classId: "wheel", day: "2026-11-17", start: "2026-11-17T23:30:00.000Z", left: 3 },
      { classId: "glaze", day: "2026-11-17", start: "2026-11-17T15:00:00.000Z", left: 6 },
      { classId: "gone", day: "2026-11-18", start: "2026-11-18T15:00:00.000Z", left: 2 },
    ] });
    expect(days.map((d) => d.day)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(days[1].sessions.map((s) => s.klass.name)).toEqual(["Glazing", "Wheel throwing"]);
    // A session of a class the answer doesn't list is left out rather than shown without a name.
    expect(days[2].sessions).toEqual([]);
    expect(timetableDays({})).toEqual([]);
  });
  it("says how full a class is", () => {
    expect(placesState(0, 8)).toBe("full");
    expect(placesState(1, 8)).toBe("last");
    expect(placesState(2, 8)).toBe("few");
    expect(placesState(3, 8)).toBe("open");
    expect(placesState(3, 12)).toBe("few");
    expect(placesState(2, 3)).toBe("open");
  });
});

describe("moving between weeks", () => {
  it("reads the week from the address and ignores anything else", () => {
    expect(weekFromSearch("?from=2026-11-23")).toBe("2026-11-23");
    expect(weekFromSearch("?from=next")).toBe("");
    expect(weekFromSearch("")).toBe("");
  });
  it("never goes before today or past the last day that can be booked", () => {
    expect(weekStep("2026-11-16", "2026-11-16", "2027-01-15", -1)).toBeNull();
    expect(weekStep("2026-11-23", "2026-11-16", "2027-01-15", -1)).toBe("2026-11-16");
    expect(weekStep("2026-11-20", "2026-11-16", "2027-01-15", -1)).toBe("2026-11-16");
    expect(weekStep("2026-11-16", "2026-11-16", "2027-01-15", 1)).toBe("2026-11-23");
    expect(weekStep("2027-01-11", "2026-11-16", "2027-01-15", 1)).toBeNull();
  });
  it("hands over to Book a time with the class and day chosen", () => {
    expect(signUpPath("wheel", "2026-11-21")).toBe("/book?service=wheel&day=2026-11-21");
  });
  it("names the week and a day", () => {
    expect(weekRangeText("2026-11-16")).toMatch(/16.*22.*2026/);
    expect(weekRangeText("2026-11-16").match(/2026/g)).toHaveLength(1);
    expect(weekRangeText("2026-11-30")).toMatch(/30.*6.*2026/);
    expect(dayHeading("2026-11-21")).toMatch(/Saturday/);
  });
});
