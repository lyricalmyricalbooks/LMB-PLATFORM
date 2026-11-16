// Places held for the waiting list on the Bookings calendar: inside their class card, or a row of their own.
import { describe, expect, it } from "vitest";
import { heldPlaces, placeHolds } from "./bookingsView";
import type { Waiting } from "./bookingsApi";

const base = { serviceName: "Riso workshop", day: "2026-11-21", email: "x@example.com", createdAt: "2026-11-16T10:00:00.000Z" };
const w = (id: string, extra: Partial<Waiting>): Waiting => ({ id, serviceId: "riso", start: null, name: id, ...base, ...extra });

describe("held places on the calendar", () => {
  const list = [
    w("waiting", {}),
    w("late", { heldUntil: "2026-11-16T14:00:00.000Z", heldStart: "2026-11-21T19:00:00.000Z" }),
    w("class", { heldUntil: "2026-11-16T14:00:00.000Z", heldStart: "2026-11-21T19:00:00Z" }),
    w("visit", { serviceId: "visit", heldUntil: "2026-11-16T14:00:00.000Z", heldStart: "2026-11-21T15:00:00.000Z" }),
  ];
  it("keeps only the people holding a place, earliest first", () => {
    expect(heldPlaces(list).map((h) => h.id)).toEqual(["visit", "late", "class"]);
  });
  it("puts a hold inside its class card by service and start (however the time is written) and the rest on their own", () => {
    const { inClass, loose } = placeHolds(heldPlaces(list), [{ serviceId: "riso", start: "2026-11-21T19:00:00.000Z" }]);
    expect(inClass("riso", "2026-11-21T19:00:00.000Z").map((h) => h.id)).toEqual(["late", "class"]);
    expect(inClass("visit", "2026-11-21T19:00:00.000Z")).toEqual([]);
    expect(loose.map((h) => h.id)).toEqual(["visit"]);
  });
});
