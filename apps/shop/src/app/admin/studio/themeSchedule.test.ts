import { describe, expect, it } from "vitest";
import { isNonexistentTorontoTime, formatToronto, isoToTorontoLocal, scheduleProblems, schedulerHealth, torontoLocalToIso } from "./themeSchedule";

describe("Toronto time (scheduling)", () => {
  it("turns Toronto wall-clock time into UTC across daylight saving", () => {
    expect(torontoLocalToIso("2026-10-10T09:00")).toBe("2026-10-10T13:00:00.000Z"); // EDT, UTC-4
    expect(torontoLocalToIso("2026-12-01T09:00")).toBe("2026-12-01T14:00:00.000Z"); // EST, UTC-5
    expect(torontoLocalToIso("2026-11-01T01:30")).toMatch(/^2026-11-01T0[56]:30:00.000Z$/); // the repeated hour
    expect(torontoLocalToIso("not a date")).toBeNull();
  });
  it("never moves a time that doesn't exist (spring forward) an hour earlier, and says so", () => {
    // 2027-03-14: Toronto goes from 02:00 straight to 03:00.
    const iso = torontoLocalToIso("2027-03-14T02:30")!;
    expect(Date.parse(iso)).toBeGreaterThanOrEqual(Date.parse("2027-03-14T07:00:00.000Z")); // 03:00 EDT or later, not 01:30 EST
    expect(isNonexistentTorontoTime("2027-03-14T02:30")).toBe(true);
    expect(isNonexistentTorontoTime("2027-03-14T01:59")).toBe(false);
    expect(isNonexistentTorontoTime("2027-03-14T03:00")).toBe(false);
    expect(isNonexistentTorontoTime("2026-11-01T01:30")).toBe(false); // the repeated hour exists (twice)
    const now = Date.parse("2027-03-01T12:00:00Z");
    expect(scheduleProblems({ kind: "publish", startAt: iso, startLocal: "2027-03-14T02:30" }, [], now)[0]).toMatch(/doesn't exist in Toronto/);
    expect(scheduleProblems({ kind: "campaign", startAt: torontoLocalToIso("2027-03-10T09:00"), startLocal: "2027-03-10T09:00", endAt: iso, endLocal: "2027-03-14T02:30" }, [], now)[0]).toMatch(/The end time/);
    expect(scheduleProblems({ kind: "publish", startAt: torontoLocalToIso("2027-03-14T03:00"), startLocal: "2027-03-14T03:00" }, [], now)).toEqual([]);
  });
  it("round-trips for the datetime fields", () => {
    for (const local of ["2026-03-08T03:15", "2026-07-01T00:00", "2027-01-15T23:45"]) expect(isoToTorontoLocal(torontoLocalToIso(local)!)).toBe(local);
    expect(formatToronto("2026-10-10T13:00:00.000Z")).toMatch(/Oct 10/);
  });
});

describe("schedule checks", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  it("needs a future start, and an end after it for campaigns", () => {
    expect(scheduleProblems({ kind: "publish", startAt: null }, [], now)).toEqual(["Choose when it should start."]);
    expect(scheduleProblems({ kind: "publish", startAt: "2026-10-09T10:00:00Z" }, [], now)[0]).toMatch(/already passed/);
    expect(scheduleProblems({ kind: "publish", startAt: "2026-10-10T10:00:00Z" }, [], now)).toEqual([]);
    expect(scheduleProblems({ kind: "campaign", startAt: "2026-10-10T10:00:00Z", endAt: "2026-10-10T09:00:00Z" }, [], now)).toEqual(["The end must be after the start."]);
    expect(scheduleProblems({ kind: "campaign", startAt: "2026-10-10T10:00:00Z", endAt: null }, [], now)).toEqual(["Choose when the campaign should end."]);
  });
  it("runs campaigns one at a time", () => {
    const existing: any[] = [{ id: "x", kind: "campaign", name: "Autumn sale", status: "scheduled", startAt: "2026-10-12T00:00:00Z", endAt: "2026-10-20T00:00:00Z" }];
    expect(scheduleProblems({ kind: "campaign", startAt: "2026-10-15T00:00:00Z", endAt: "2026-10-25T00:00:00Z" }, existing, now)).toEqual(["It overlaps “Autumn sale”. Campaigns run one at a time."]);
    expect(scheduleProblems({ kind: "campaign", startAt: "2026-10-20T00:00:00Z", endAt: "2026-10-25T00:00:00Z" }, existing, now)).toEqual([]);
    expect(scheduleProblems({ kind: "campaign", startAt: "2026-10-15T00:00:00Z", endAt: "2026-10-25T00:00:00Z" }, [{ ...existing[0], status: "cancelled" }], now)).toEqual([]);
  });
  it("says whether the server scheduler is running", () => {
    expect(schedulerHealth(null, now).state).toBe("never");
    expect(schedulerHealth("2026-10-09T11:50:00Z", now).state).toBe("ok");
    expect(schedulerHealth("2026-10-09T10:00:00Z", now).state).toBe("stale");
  });
});
