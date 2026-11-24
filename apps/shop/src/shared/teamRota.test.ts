// Shifts and time off (plan 4, 4.3): planned shifts and time off asks. Run against the shop's copy and the server's.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import * as shop from "./teamRota";

const server = createRequire(import.meta.url)("../../functions/shared/teamRota.js") as typeof shop;

describe.each([["shop", shop], ["server", server]] as const)("team rota (%s copy)", (_name, t) => {
  test("a planned shift needs a person, a day and a finish after its start", () => {
    expect(t.cleanRotaShift({ email: "Sam@Example.com", name: " Sam ", day: "2026-11-18", start: "09:00", end: "13:00", note: "  Opening  " }))
      .toEqual({ shift: { email: "sam@example.com", name: "Sam", day: "2026-11-18", start: "09:00", end: "13:00", note: "Opening" } });
    expect("error" in t.cleanRotaShift({ email: "sam@example.com", day: "2026-11-18", start: "13:00", end: "09:00" })).toBe(true);
    expect("error" in t.cleanRotaShift({ email: "sam", day: "2026-11-18", start: "09:00", end: "13:00" })).toBe(true);
    expect(t.rotaMinutes({ start: "09:00", end: "13:30" })).toBe(270);
  });

  test("time off is whole days from today on, or part of one day, at most 60 days", () => {
    const base = { email: "ana@example.com", name: "Ana" };
    expect(t.cleanTimeOff({ ...base, from: "2026-11-20", to: "2026-11-21" }, "2026-11-17")).toEqual({ ask: { ...base, from: "2026-11-20", to: "2026-11-21", status: "waiting" } });
    expect(t.cleanTimeOff({ ...base, from: "2026-11-20", start: "14:00", end: "16:00" }, "2026-11-17")).toMatchObject({ ask: { from: "2026-11-20", to: "2026-11-20", start: "14:00", end: "16:00" } });
    for (const bad of [{ from: "2026-11-10" }, { from: "2026-11-20", to: "2026-11-19" }, { from: "2026-11-20", to: "2027-03-01" }, { from: "2026-11-20", to: "2026-11-21", start: "14:00", end: "16:00" }, { from: "2026-11-20", start: "16:00", end: "14:00" }]) {
      expect("error" in t.cleanTimeOff({ ...base, ...bad }, "2026-11-17")).toBe(true);
    }
    expect(t.daysBetween("2026-11-29", "2026-12-02")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  });

  test("says a request's days in plain words", () => {
    expect(t.timeOffWhen({ from: "2026-11-24", to: "2026-11-24" })).toBe("Tue 24 Nov");
    expect(t.timeOffWhen({ from: "2026-11-24", to: "2026-11-28" })).toBe("Tue 24 to Sat 28 Nov");
    expect(t.timeOffWhen({ from: "2026-11-30", to: "2026-12-02" })).toBe("Mon 30 Nov to Wed 2 Dec");
    expect(t.timeOffWhen({ from: "2026-11-24", to: "2026-11-24", start: "14:00", end: "16:30" })).toBe("Tue 24 Nov, 2:00 PM to 4:30 PM");
  });
});
