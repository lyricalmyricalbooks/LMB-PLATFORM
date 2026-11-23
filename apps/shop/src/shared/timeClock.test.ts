// Clock in and out (plan 4, 4.2): shifts, breaks and minutes worked. Run against the shop's copy and the server's.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import * as shop from "./timeClock";

const server = createRequire(import.meta.url)("../../functions/shared/timeClock.js") as typeof shop;

describe.each([["shop", shop], ["server", server]] as const)("time clock (%s copy)", (_name, t) => {
  const base = { email: "Ana@Example.com", name: "Ana", day: "2026-11-17", in: "2026-11-17T14:00:00Z", out: "2026-11-17T22:00:00Z" };

  test("a shift's minutes leave out its breaks, and an open one counts up to now", () => {
    const s = { ...base, breaks: [{ start: "2026-11-17T17:00:00Z", end: "2026-11-17T17:30:00Z" }] };
    expect(t.shiftMinutes(s, 0)).toBe(450);
    expect(t.shiftMinutes({ ...s, out: null }, Date.parse("2026-11-17T18:00:00Z"))).toBe(210);
    expect(t.shiftMinutes({ ...s, out: null, breaks: [{ start: "2026-11-17T17:00:00Z", end: null }] }, Date.parse("2026-11-17T18:00:00Z"))).toBe(180);
    expect(t.hoursText(450)).toBe("7h 30m");
    expect(t.hoursText(45)).toBe("45m");
    expect(t.hoursText(120)).toBe("2h");
  });

  test("cleanShift keeps a good shift and refuses impossible ones", () => {
    const ok = t.cleanShift({ ...base, breaks: [] });
    expect(ok).toEqual({ shift: { email: "ana@example.com", name: "Ana", day: "2026-11-17", in: "2026-11-17T14:00:00.000Z", out: "2026-11-17T22:00:00.000Z", breaks: [], by: "owner" } });
    expect("error" in t.cleanShift({ ...base, out: "2026-11-17T13:00:00Z" })).toBe(true);
    expect("error" in t.cleanShift({ ...base, out: "2026-11-18T08:00:00Z" })).toBe(true); // 18 hours
    expect("error" in t.cleanShift({ ...base, breaks: [{ start: "2026-11-17T23:00:00Z", end: "2026-11-17T23:10:00Z" }] })).toBe(true);
    expect("error" in t.cleanShift({ ...base, breaks: [{ start: "2026-11-17T15:00:00Z", end: null }] })).toBe(true);
    expect("error" in t.cleanShift({ ...base, out: null, breaks: [{ start: "2026-11-17T15:00:00Z", end: null }] })).toBe(false);
    expect("error" in t.cleanShift({ ...base, email: "nobody" })).toBe(true);
  });

  test("clockStep moves a person in, onto a break, back, and out (which ends a break)", () => {
    const who = { email: "ana@example.com", name: "Ana", staffId: "ana", day: "2026-11-17" };
    const a = t.clockStep(null, "in", "2026-11-17T14:00:00.000Z", who);
    if (!("shift" in a)) throw new Error("not in");
    expect(t.clockState(a.shift)).toEqual({ state: "working", since: "2026-11-17T14:00:00.000Z", shiftIn: "2026-11-17T14:00:00.000Z" });
    expect(t.clockStep(a.shift, "in", "x", who)).toMatchObject({ code: "already_in" });
    expect(t.clockStep(a.shift, "back", "x", who)).toMatchObject({ code: "not_on_break" });
    const b = t.clockStep(a.shift, "break", "2026-11-17T17:00:00.000Z", who);
    if (!("shift" in b)) throw new Error("no break");
    expect(t.clockState(b.shift).state).toBe("break");
    const c = t.clockStep(b.shift, "out", "2026-11-17T17:20:00.000Z", who);
    if (!("shift" in c)) throw new Error("not out");
    expect(c.shift.breaks[0].end).toBe("2026-11-17T17:20:00.000Z");
    expect(t.clockState(c.shift)).toEqual({ state: "off" });
    expect(t.clockStep(null, "out", "x", who)).toMatchObject({ code: "not_in" });
  });

  test("a shift left open past the longest is flagged as forgotten", () => {
    expect(t.forgotten({ in: "2026-11-17T14:00:00Z", out: null }, Date.parse("2026-11-18T07:00:00Z"))).toBe(true);
    expect(t.forgotten({ in: "2026-11-17T14:00:00Z", out: null }, Date.parse("2026-11-17T20:00:00Z"))).toBe(false);
    expect(t.hourlyOf("2050")).toBe(2050);
    expect(t.hourlyOf(-3)).toBe(0);
  });
});
