// Rentals (beta, R1): what an item is, what a rental costs and which unit is free. Run against the server copy too.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import * as shop from "./rentalRules";

const server = createRequire(import.meta.url)("../../functions/shared/rentalRules.js") as typeof shop;
const ZONE = "America/Toronto";
const NOW = Date.parse("2026-11-18T12:00:00Z");

for (const [side, lib] of [["shop", shop], ["server", server]] as const) {
  describe(`rental rules (${side})`, () => {
    const kit = lib.cleanRentalItem({ name: " Camera  kit ", units: 3, basis: "hour", hourMinor: 2000, dayMinor: 9000, minLength: 2, maxLength: 8, cleanMinutes: 30, opens: "09:00", closes: "17:00" }, "kit00001") as shop.RentalItem;
    const press = lib.cleanRentalItem({ name: "Letterpress", basis: "day", dayMinor: 5000, weekMinor: 25000, minLength: 1, maxLength: 30 }, "press001") as shop.RentalItem;

    test("an item is tidied and checked in plain words", () => {
      expect(kit).toMatchObject({ name: "Camera kit", units: 3, basis: "hour", weekMinor: 0, cleanMinutes: 30, status: "live" });
      expect(lib.cleanRentalItem({ name: "" })).toEqual({ problem: "Give the item a name." });
      expect(lib.cleanRentalItem({ name: "x", basis: "day" })).toEqual({ problem: "Set a daily or weekly price." });
      expect(lib.cleanRentalItem({ name: "x", hourMinor: 10 })).toEqual({ problem: "A price must be at least 0.50, or left empty." });
      expect(lib.cleanRentalItem({ name: "x", hourMinor: 1000, opens: "18:00", closes: "09:00" })).toEqual({ problem: "Closing time must be after opening time." });
      expect(lib.cleanRentalItem({ name: "x", hourMinor: 1000, units: 2, repair: [2, 5, 2] })).toMatchObject({ repair: [2] });
    });

    test("the cheapest fair price is picked", () => {
      expect(lib.rentalPrice(kit, 3)).toBe(6000);
      expect(lib.rentalPrice(kit, 6)).toBe(9000);
      expect(lib.rentalPrice(press, 3)).toBe(15000);
      expect(lib.rentalPrice(press, 6)).toBe(25000);
      expect(lib.rentalPrice(press, 8)).toBe(30000);
      expect(lib.rentalPrice(press, 13)).toBe(50000);
    });

    test("an asked rental is checked against the hours and lengths", () => {
      const ok = lib.rentalWhen(kit, { day: "2026-11-20", start: "10:00", hours: 3 }, ZONE, NOW) as shop.RentalWhen;
      expect(ok.endMs - ok.startMs).toBe(3 * shop.HOUR);
      expect(new Date(ok.startMs).toISOString()).toBe("2026-11-20T15:00:00.000Z");
      expect(lib.rentalWhen(kit, { day: "2026-11-20", start: "16:00", hours: 3 }, ZONE, NOW)).toEqual({ problem: "That time is outside the pickup and return hours." });
      expect(lib.rentalWhen(kit, { day: "2026-11-20", start: "10:00", hours: 1 }, ZONE, NOW)).toEqual({ problem: "Rent it for 2 to 8 hours." });
      expect(lib.rentalWhen(kit, { day: "2026-11-17", start: "10:00", hours: 2 }, ZONE, NOW)).toEqual({ problem: "That time has passed." });
      const week = lib.rentalWhen(press, { day: "2026-11-20", endDay: "2026-11-26" }, ZONE, NOW) as shop.RentalWhen;
      expect(week.length).toBe(7);
      expect(lib.rentalWhen(press, { day: "2026-11-20", endDay: "2026-11-19" }, ZONE, NOW)).toEqual({ problem: "The return day must be on or after the pickup day." });
    });

    test("units are shared out, with cleaning time and holds that run out", () => {
      const when = lib.rentalWhen(kit, { day: "2026-11-20", start: "10:00", hours: 2 }, ZONE, NOW) as shop.RentalWhen;
      const spans: shop.RentalSpan[] = [
        { id: "a", unit: 1, from: when.startMs, until: when.endMs + 30 * shop.MINUTE },
        { id: "b", unit: 2, from: when.startMs, until: when.endMs, held: true, holdUntil: NOW + shop.MINUTE },
        { id: "c", unit: 3, from: when.startMs, until: when.endMs, held: true, holdUntil: NOW - shop.MINUTE },
      ];
      expect(lib.freeUnit(kit, spans, when, NOW)).toBe(3);
      expect(lib.unitsFree(kit, spans, when, NOW)).toBe(1);
      expect(lib.freeUnit({ ...kit, repair: [3] }, spans, when, NOW)).toBe(0);
      // Right after a rental, the cleaning time keeps the unit busy.
      const next = lib.rentalWhen(kit, { day: "2026-11-20", start: "12:00", hours: 2 }, ZONE, NOW) as shop.RentalWhen;
      expect(lib.freeUnit({ ...kit, units: 1 }, spans, next, NOW)).toBe(0);
      expect(lib.freeUnit({ ...kit, units: 1, cleanMinutes: 0 }, [{ ...spans[0], until: when.endMs }], next, NOW)).toBe(1);
      expect(lib.hourChoices(kit, spans, "2026-11-20", 2, ZONE, NOW).find((c) => c.start === "10:00")?.free).toBe(1);
      expect(lib.dayChoices(press, [], "2026-11-20", 3, ZONE, NOW).map((d) => d.free)).toEqual([1, 1, 1]);
    });
  });
}
