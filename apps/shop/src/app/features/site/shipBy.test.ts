import { describe, expect, it } from "vitest";
import { closedDays, formatShipDate, shipBy, shipByCopy, torontoClock } from "./shipBy";

// 2026-10-22 is a Thursday. 14:00 UTC = 10:00 Toronto (EDT, UTC−4).
const at = (iso: string) => Date.parse(iso);
const rules = { days: 2, cutoffHour: 14, closed: [] as string[] };

describe("shipBy", () => {
  it("reads the Toronto clock", () => {
    expect(torontoClock(at("2026-10-22T14:05:00Z"))).toEqual({ date: "2026-10-22", hour: 10, minute: 5 });
    expect(torontoClock(at("2026-10-23T02:00:00Z")).date).toBe("2026-10-22");
  });

  it("counts working days from today before the cut-off", () => {
    expect(shipBy(at("2026-10-22T14:00:00Z"), rules)).toEqual({ date: "2026-10-26", minutesToCutoff: 240 });
    expect(shipBy(at("2026-10-22T14:00:00Z"), { ...rules, days: 0 })?.date).toBe("2026-10-22");
  });

  it("counts from the next working day after the cut-off and at weekends", () => {
    // Thursday 15:00 Toronto → counts from Friday → +2 working days = Tuesday.
    expect(shipBy(at("2026-10-22T19:00:00Z"), rules)).toEqual({ date: "2026-10-27", minutesToCutoff: null });
    // Saturday → counts from Monday.
    expect(shipBy(at("2026-10-24T14:00:00Z"), { ...rules, days: 0 })?.date).toBe("2026-10-26");
  });

  it("skips the owner's closed days", () => {
    expect(shipBy(at("2026-10-22T14:00:00Z"), { ...rules, closed: ["2026-10-23", "2026-10-26"] })?.date).toBe("2026-10-28");
    expect(closedDays("2026-12-25, 2026-12-26; nonsense 2026-1-1")).toEqual(["2026-12-25", "2026-12-26"]);
  });

  it("refuses rules that make no sense", () => {
    expect(shipBy(at("2026-10-22T14:00:00Z"), { ...rules, days: -1 })).toBeNull();
    expect(shipBy(NaN, rules)).toBeNull();
  });

  it("picks the countdown wording only near the cut-off", () => {
    expect(shipByCopy({ date: "2026-10-26", minutesToCutoff: 135 }, "Mon", 4)).toEqual({ key: "pdpShipByCountdown", values: { date: "Mon", hours: "2", minutes: "15" } });
    expect(shipByCopy({ date: "2026-10-26", minutesToCutoff: 300 }, "Mon", 4).key).toBe("pdpShipBy");
    expect(shipByCopy({ date: "2026-10-26", minutesToCutoff: 60 }, "Mon", 0).key).toBe("pdpShipBy");
    expect(shipByCopy({ date: "2026-10-26", minutesToCutoff: null }, "Mon", 4).key).toBe("pdpShipBy");
  });

  it("formats the date with the weekday", () => {
    expect(formatShipDate("2026-10-26", "en-CA")).toMatch(/Monday.*Oct.*26/);
    expect(formatShipDate("bad")).toBe("");
  });
});
