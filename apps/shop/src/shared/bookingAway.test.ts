// Away reply (plan 4, 3.7): is the shop closed now, and when does it open again? Run against the shop's copy and the server's.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import * as shop from "./bookingTimes";

const server = createRequire(import.meta.url)("../../functions/shared/bookingTimes.js") as typeof shop;
const ZONE = "America/Toronto";
const week = (w: { start: string; end: string }[]) => [[], w, w, w, w, w, []]; // Monday to Friday

describe.each([["shop", shop], ["server", server]] as const)("away reply (%s copy)", (_name, t) => {
  const settings = { hours: week([{ start: "10:00", end: "13:00" }, { start: "14:00", end: "18:00" }]), daysOff: [] as string[] };
  const at = (day: string, hhmm: string) => t.zonedTime(day, hhmm, ZONE);

  test("open inside a window: no away reply", () => {
    expect(t.awayNow(settings, at("2026-11-23", "10:00"), ZONE)).toBeNull();
    expect(t.awayNow(settings, at("2026-11-23", "17:59"), ZONE)).toBeNull();
  });

  test("lunch break, evening and weekend: back at the next window", () => {
    expect(t.awayNow(settings, at("2026-11-23", "13:30"), ZONE)).toEqual({ backAt: at("2026-11-23", "14:00") });
    expect(t.awayNow(settings, at("2026-11-23", "18:00"), ZONE)).toEqual({ backAt: at("2026-11-24", "10:00") });
    expect(t.awayNow(settings, at("2026-11-28", "12:00"), ZONE)).toEqual({ backAt: at("2026-11-30", "10:00") });
  });

  test("days off and holiday hours count", () => {
    const off = { ...settings, daysOff: ["2026-11-24"] };
    expect(t.awayNow(off, at("2026-11-24", "11:00"), ZONE)).toEqual({ backAt: at("2026-11-25", "10:00") });
    const holiday = { ...settings, specialHours: [{ id: "h1", label: "Holidays", from: "2026-12-24", to: "2026-12-28", hours: [] }] };
    expect(t.awayNow(holiday, at("2026-12-24", "11:00"), ZONE)).toEqual({ backAt: at("2026-12-29", "10:00") });
  });

  test("no hours at all within three weeks: away with no return time", () => {
    expect(t.awayNow({ hours: week([]), daysOff: [] }, at("2026-11-23", "11:00"), ZONE)).toEqual({ backAt: null });
  });

  test("the setting is kept, the words cleaned and cut to size", () => {
    const s = t.cleanBookingSettings({ awayReply: true, awayWords: "  We're out.\r\n\r\n\r\n\r\nBack soon!  " + "x".repeat(900) });
    expect(s.awayReply).toBe(true);
    expect(s.awayWords!.startsWith("We're out.\n\nBack soon!")).toBe(true);
    expect(s.awayWords!.length).toBe(t.MAX_AWAY_WORDS);
    const plain = t.cleanBookingSettings({ awayReply: "yes", awayWords: 12 });
    expect(plain.awayReply).toBe(false);
    expect("awayWords" in plain).toBe(false);
  });
});
