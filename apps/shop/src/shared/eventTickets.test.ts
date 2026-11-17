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

    test("a refund gives back the tickets' prices with their share of tax, and the last one returns what is left", () => {
      const order = { lines: [{ ticketId: "gen", name: "General", qty: 3, priceMinor: 1000 }, { ticketId: "sup", name: "Supporter", qty: 1, priceMinor: 2500 }], totalMinor: 5500, taxMinor: 715, chargedMinor: 6215 };
      expect(lib.refundMinorFor(order, { gen: 1 }, 3)).toBe(1130);
      expect(lib.refundMinorFor(order, { gen: 2, sup: 1 }, 1)).toBe(4500 + 585);
      expect(lib.refundMinorFor({ ...order, refundedMinor: 1130 }, { gen: 2, sup: 1 }, 0)).toBe(5085);
      expect(lib.refundMinorFor(order, { gen: 9 }, 1)).toBe(3390);
      expect(lib.refundMinorFor({ lines: order.lines, totalMinor: 0, chargedMinor: 0 }, { gen: 1 }, 2)).toBe(0);
      expect(lib.refundMinorFor({ ...order, refundedMinor: 6000 }, { gen: 1 }, 2)).toBe(215);
      // With a discount code the refund is the same share of what was really paid (4400 + 572 tax for 5500 of tickets).
      const cut = { ...order, totalMinor: 4400, taxMinor: 572, chargedMinor: 4972 };
      expect(lib.refundMinorFor(cut, { gen: 1 }, 3)).toBe(904);
      expect(lib.refundMinorFor({ ...cut, refundedMinor: 904 }, { gen: 2, sup: 1 }, 0)).toBe(4068);
      expect(lib.withReturned({ sold: { gen: 3, sup: 1 }, held: { o9: { until: "2026-12-01T00:00:00Z", lines: { gen: 1 } } } }, { gen: 2, sup: 5 }))
        .toEqual({ sold: { gen: 1, sup: 0 }, held: { o9: { until: "2026-12-01T00:00:00Z", lines: { gen: 1 } } } });
    });

    test("extras are tidied on the event, priced on the order and left out of a ticket's refund", () => {
      const withExtras = lib.cleanEvent({ ...EVENT, extras: [{ id: "prog", name: " Programme ", priceMinor: 500 }, { name: "Drink", priceMinor: 800, maxPerOrder: 2 }] }, "ev000001") as shop.ShopEvent;
      expect(withExtras.extras).toEqual([{ id: "prog", name: "Programme", priceMinor: 500, maxPerOrder: 10 }, { id: "x2", name: "Drink", priceMinor: 800, maxPerOrder: 2 }]);
      expect(event.extras).toBeUndefined();
      expect(lib.cleanEvent({ ...EVENT, extras: [{ name: "Free thing", priceMinor: 0 }] })).toHaveProperty("problem");
      expect(lib.cleanEvent({ ...EVENT, extras: [{ name: "" }] })).toEqual({ problem: "Give each extra a name, like Programme." });
      expect(lib.cleanEvent({ ...EVENT, extras: Array.from({ length: 9 }, (_, i) => ({ name: `E${i}`, priceMinor: 500 })) })).toHaveProperty("problem");
      expect(lib.extraLines(withExtras, { x2: 2, prog: 1, nothing: 0 })).toEqual({
        lines: [{ extraId: "prog", name: "Programme", qty: 1, priceMinor: 500 }, { extraId: "x2", name: "Drink", qty: 2, priceMinor: 800 }], totalMinor: 2100,
      });
      expect(lib.extraLines(withExtras, undefined)).toEqual({ lines: [], totalMinor: 0 });
      expect(lib.extraLines(withExtras, { x2: 3 })).toEqual({ problem: 'You can add up to 2 of "Drink" to one order.' });
      expect(lib.extraLines(withExtras, { gone: 1 })).toEqual({ problem: lib.TICKET_MESSAGES.extraGone });
      expect(lib.extraLines(event, { prog: 1 })).toEqual({ problem: lib.TICKET_MESSAGES.extraGone });
      // Two 10.00 tickets and a 5.00 extra, 13% tax: one ticket back is 11.30, never a share of the extra.
      const order = { lines: [{ ticketId: "gen", name: "General", qty: 2, priceMinor: 1000 }], totalMinor: 2500, extrasMinor: 500, taxMinor: 325, chargedMinor: 2825 };
      expect(lib.refundMinorFor(order, { gen: 1 }, 1)).toBe(1130);
      expect(lib.refundMinorFor({ ...order, refundedMinor: 1130 }, { gen: 1 }, 0)).toBe(1695);
      // A booking fee of 1.00 a paid ticket is part of the tickets' share: one of two 10.00 tickets back returns 11.00.
      expect(lib.cleanEvent({ ...EVENT, feeMinor: 100 })).toMatchObject({ feeMinor: 100 });
      expect(event.feeMinor).toBeUndefined();
      expect(lib.cleanEvent({ ...EVENT, feeMinor: 2001 })).toHaveProperty("problem");
      expect(lib.cleanEvent({ ...EVENT, feeMinor: -1 })).toHaveProperty("problem");
      expect(lib.bookingFeeMinor({ feeMinor: 100 }, [{ qty: 2, priceMinor: 1000 }, { qty: 3, priceMinor: 0 }])).toBe(200);
      expect(lib.bookingFeeMinor({}, [{ qty: 2, priceMinor: 1000 }])).toBe(0);
      const fee = { lines: order.lines, totalMinor: 2700, extrasMinor: 500, feeMinor: 200, chargedMinor: 2700 };
      expect(lib.refundMinorFor(fee, { gen: 1 }, 1)).toBe(1100);
      // Free tickets with a paid extra: one ticket back returns nothing, the last returns the extra's money.
      const free = { lines: [{ ticketId: "gen", name: "General", qty: 2, priceMinor: 0 }], totalMinor: 500, extrasMinor: 500, chargedMinor: 500 };
      expect(lib.refundMinorFor(free, { gen: 1 }, 1)).toBe(0);
      expect(lib.refundMinorFor(free, { gen: 1 }, 0)).toBe(500);
    });

    test("a moved order lands on the kind with the same name, the only kind, or the owner's pick, and keeps what was paid", () => {
      const from = [{ ticketId: "gen", name: "General" }, { ticketId: "sup", name: "Supporter" }];
      const to = [{ id: "a", name: " general " }, { id: "b", name: "Balcony" }];
      expect(lib.moveKinds(from, to)).toEqual({ gen: "a", sup: null });
      expect(lib.moveKinds(from, to, { sup: "b", gen: "nope" })).toEqual({ gen: "a", sup: "b" });
      expect(lib.moveKinds(from, [{ id: "one", name: "Entry" }])).toEqual({ gen: "one", sup: "one" });
      const lines = [{ ticketId: "gen", name: "General", qty: 3, priceMinor: 1000 }, { ticketId: "sup", name: "Supporter", qty: 1, priceMinor: 2500 }];
      expect(lib.movedLines(lines, { gen: "a", sup: "b" }, to)).toEqual([{ ticketId: "a", name: " general ", qty: 3, priceMinor: 1000 }, { ticketId: "b", name: "Balcony", qty: 1, priceMinor: 2500 }]);
      expect(lib.movedLines(lines, { gen: "one", sup: "one" }, [{ id: "one", name: "Entry" }])).toEqual([{ ticketId: "one", name: "Entry", qty: 4, priceMinor: 1375 }]);
      expect(lib.withArrived({ sold: { a: 2 }, held: {} }, { a: 3, b: 1 })).toEqual({ sold: { a: 5, b: 1 }, held: {} });
    });
  });
}
