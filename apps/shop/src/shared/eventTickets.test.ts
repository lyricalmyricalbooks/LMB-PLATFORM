// Events and tickets (beta): what an event is, how places are counted and what an order costs. Run against the
// generated server copy too, so the shop and the server can't drift.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import * as shop from "./eventTickets";

const server = createRequire(import.meta.url)("../../functions/shared/eventTickets.js") as typeof shop;

const EVENT = {
  title: "  Autumn   launch ", start: "2026-12-05T19:00:00-05:00", end: "2026-12-05T22:00:00-05:00", venue: "The Print Room", status: "live",
  tickets: [{ id: "gen", name: "General", priceMinor: 1500, places: 3 }, { id: "stu", name: "Student", priceMinor: 0, places: 2, maxPerOrder: 1 }],
};
const NOW = Date.parse("2026-11-17T12:00:00Z");

for (const [side, lib] of [["shop", shop], ["server", server]] as const) {
  describe(`event rules (${side})`, () => {
    const event = lib.cleanEvent(EVENT, "ev000001") as shop.ShopEvent;

    test("an event is tidied and checked in plain words", () => {
      expect(event.title).toBe("Autumn launch");
      expect(event.start).toBe("2026-12-06T00:00:00.000Z");
      expect(event.tickets[0]).toEqual({ id: "gen", name: "General", priceMinor: 1500, places: 3, maxPerOrder: 10 });
      expect(lib.cleanEvent({ ...EVENT, title: "" })).toEqual({ problem: "Give the event a name." });
      expect(lib.cleanEvent({ ...EVENT, end: EVENT.start })).toEqual({ problem: "The event ends after it starts." });
      expect(lib.cleanEvent({ ...EVENT, tickets: [] })).toEqual({ problem: "Add at least one ticket." });
      expect(lib.cleanEvent({ ...EVENT, tickets: [{ name: "Cheap", priceMinor: 20, places: 5 }] })).toHaveProperty("problem");
      expect(lib.cleanEvent({ ...EVENT, onlineUrl: "javascript:alert(1)" })).toMatchObject({ onlineUrl: "" });
      expect(lib.cleanEvent({ ...EVENT, status: "anything" })).toMatchObject({ status: "draft" });
    });

    test("sales are open only while live and before the start", () => {
      expect(lib.salesOpen(event, NOW)).toBe(true);
      expect(lib.salesOpen({ ...event, status: "draft" }, NOW)).toBe(false);
      expect(lib.salesOpen({ ...event, status: "cancelled" }, NOW)).toBe(false);
      expect(lib.salesOpen(event, Date.parse(event.start))).toBe(false);
    });

    test("places left count sold tickets and holds still running, not ones that ran out", () => {
      const places = { sold: { gen: 1 }, held: { a: { until: new Date(NOW + 60_000).toISOString(), lines: { gen: 1 } }, b: { until: new Date(NOW - 1).toISOString(), lines: { gen: 1, stu: 2 } } } };
      expect(lib.placesLeft(event, places, NOW)).toEqual({ gen: 1, stu: 2 });
      expect(lib.placesLeft(event, places, NOW, "a")).toEqual({ gen: 2, stu: 2 });
      expect(lib.placesLeft(event, { sold: { gen: 9 } }, NOW)).toEqual({ gen: 0, stu: 2 });
      expect(lib.soldCount(event, places)).toEqual({ byKind: { gen: 1, stu: 0 }, total: 1, places: 5 });
    });

    test("an order's lines follow the event's order and refuse what can't be bought", () => {
      const left = lib.placesLeft(event, null, NOW);
      expect(lib.orderLines(event, { stu: 1, gen: 2 }, left)).toEqual({
        lines: [{ ticketId: "gen", name: "General", qty: 2, priceMinor: 1500 }, { ticketId: "stu", name: "Student", qty: 1, priceMinor: 0 }], totalMinor: 3000, tickets: 3,
      });
      expect(lib.orderLines(event, {}, left)).toEqual({ problem: lib.TICKET_MESSAGES.none });
      expect(lib.orderLines(event, { gen: 0, stu: -2 }, left)).toEqual({ problem: lib.TICKET_MESSAGES.none });
      expect(lib.orderLines(event, { vip: 1 }, left)).toEqual({ problem: lib.TICKET_MESSAGES.unknown });
      expect(lib.orderLines(event, { stu: 2 }, left)).toEqual({ problem: 'You can buy up to 1 "Student" tickets at a time.' });
      expect(lib.orderLines(event, { gen: 4 }, left)).toEqual({ problem: 'Only 3 "General" tickets are left.' });
      expect(lib.orderLines(event, { gen: 1 }, { gen: 0 })).toEqual({ problem: '"General" tickets are sold out.' });
    });

    test("a hold becomes sold tickets, or is let go with every run-out hold", () => {
      const lines = [{ ticketId: "gen", name: "General", qty: 2, priceMinor: 1500 }];
      const held = lib.withHold({ sold: { gen: 1 } }, "o1", lines, new Date(NOW + 60_000).toISOString());
      expect(held.held?.o1.lines).toEqual({ gen: 2 });
      expect(lib.withSold(held, "o1", lines)).toEqual({ sold: { gen: 3 }, held: {} });
      // Paid after its hold ran out: still counted, nothing to remove.
      expect(lib.withSold({ sold: { gen: 1 } }, "o1", lines)).toEqual({ sold: { gen: 3 }, held: {} });
      const stale = { ...held, held: { ...held.held, old: { until: new Date(NOW - 1).toISOString(), lines: { gen: 1 } } } };
      expect(lib.withoutHold(stale, "o1", NOW)).toEqual({ sold: { gen: 1 }, held: {} });
    });

    test("ticket codes read one way only and typed ones are tidied", () => {
      const code = lib.ticketCodeFrom(Uint8Array.from([0, 1, 2, 3, 28, 29, 30, 31]));
      expect(code).toBe("ABCD-6789");
      expect(lib.cleanTicketCode(" abcd 6789 ")).toBe("ABCD-6789");
      expect(lib.cleanTicketCode("ABCD-678")).toBe("");
      expect(lib.cleanTicketCode("ABCD-O789")).toBe("");
    });

    test("the day and time are written in the shop's own time zone", () => {
      expect(lib.eventWhen(event.start, "America/Toronto")).toMatch(/Dec.* 5.*7:00/);
      expect(lib.eventWhen(event.start, "UTC")).toMatch(/Dec.* 6.*12:00/);
      expect(lib.eventWhen("nonsense", "America/Toronto")).toBe("");
    });
  });
}
