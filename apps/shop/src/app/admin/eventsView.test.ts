import { describe, expect, test } from "vitest";
import { arrivedCount, blankForm, eventFigures, eventFromForm, eventState, countsOfCodes, findGuests, formFromEvent, guestCsv, withOrderChanged, withTicketUsed, priceMinorOf, soldLine, splitEvents, whenParts } from "./eventsView";
import type { AdminEvent, TicketOrder } from "./eventsApi";

const ZONE = "America/Toronto";
const NOW = Date.parse("2026-11-17T15:00:00Z");
const event = (over: Partial<AdminEvent> = {}): AdminEvent => ({
  id: "ev1", title: "Autumn launch", description: "", start: "2026-12-06T00:00:00.000Z", end: "2026-12-06T03:00:00.000Z", venue: "The Print Room", address: "",
  onlineUrl: "", photo: "", status: "live", chargeTax: false, tickets: [{ id: "gen", name: "General", priceMinor: 1500, places: 40, maxPerOrder: 10 }],
  sold: { gen: 12 }, soldTotal: 12, placesTotal: 40, left: { gen: 28 }, paidMinor: 18000, orders: 7, ...over,
});

describe("the event form", () => {
  test("a new event starts two weeks out with one General ticket", () => {
    const form = blankForm(ZONE, NOW);
    expect(form).toMatchObject({ day: "2026-12-01", time: "19:00", status: "draft" });
    expect(form.tickets.map((t) => t.name)).toEqual(["General"]);
  });
  test("an event opens in the shop's own time and goes back unchanged", () => {
    const form = formFromEvent(event(), ZONE);
    expect(form).toMatchObject({ day: "2026-12-05", time: "19:00", endTime: "22:00" });
    expect(form.tickets[0]).toEqual({ id: "gen", name: "General", price: "15.00", places: "40", maxPerOrder: "10" });
    const out = eventFromForm(form, ZONE);
    expect(out).toMatchObject({ event: { id: "ev1", start: "2026-12-06T00:00:00.000Z", end: "2026-12-06T03:00:00.000Z", tickets: [{ id: "gen", priceMinor: 1500, places: 40 }] } });
  });
  test("members book first until a day and time on the shop's clock (Memberships M2c)", () => {
    const form = formFromEvent(event({ publicFrom: "2026-11-25T14:00:00.000Z" }), ZONE);
    expect(form).toMatchObject({ publicDay: "2026-11-25", publicTime: "09:00" });
    expect(eventFromForm(form, ZONE)).toMatchObject({ event: { publicFrom: "2026-11-25T14:00:00.000Z" } });
    expect(eventFromForm({ ...form, publicTime: "" }, ZONE)).toMatchObject({ event: { publicFrom: "2026-11-25T14:00:00.000Z" } });
    expect(eventFromForm({ ...form, publicDay: "", publicTime: "" }, ZONE)).toMatchObject({ event: { publicFrom: "" } });
    expect(eventFromForm({ ...form, publicDay: "2026-12-06" }, ZONE)).toHaveProperty("problem");
    expect(eventFromForm({ ...form, publicDay: "" }, ZONE)).toHaveProperty("problem");
  });
  test("an end before the start is the next morning", () => {
    const out = eventFromForm({ ...formFromEvent(event(), ZONE), time: "21:00", endTime: "01:00" }, ZONE);
    expect(out).toMatchObject({ event: { start: "2026-12-06T02:00:00.000Z", end: "2026-12-06T06:00:00.000Z" } });
  });
  test("problems are named in plain words", () => {
    const form = formFromEvent(event(), ZONE);
    expect(eventFromForm({ ...form, title: " " }, ZONE)).toEqual({ problem: "Give the event a name." });
    expect(eventFromForm({ ...form, tickets: [] }, ZONE)).toEqual({ problem: "Add at least one ticket." });
    expect(eventFromForm({ ...form, tickets: [{ ...form.tickets[0], price: "abc" }] }, ZONE)).toHaveProperty("problem");
    expect(eventFromForm({ ...form, tickets: [{ ...form.tickets[0], places: "0" }] }, ZONE)).toEqual({ problem: 'Say how many places "General" has.' });
    expect(eventFromForm({ ...form, onlineUrl: "meet.example" }, ZONE)).toEqual({ problem: "The online link starts with https://" });
  });
  test("prices are read as typed", () => {
    expect(priceMinorOf("")).toBe(0);
    expect(priceMinorOf("$12.5")).toBe(1250);
    expect(priceMinorOf("12,50")).toBe(1250);
    expect(priceMinorOf("12.345")).toBeNaN();
  });
});

describe("the list", () => {
  test("an event's badge follows its status, its start and its places", () => {
    expect(eventState(event(), NOW)).toBe("onSale");
    expect(eventState(event({ status: "draft" }), NOW)).toBe("draft");
    expect(eventState(event({ soldTotal: 40 }), NOW)).toBe("soldOut");
    expect(eventState(event({ start: "2026-11-01T00:00:00.000Z" }), NOW)).toBe("past");
    expect(eventState(event({ status: "cancelled" }), NOW)).toBe("cancelled");
  });
  test("coming events are soonest first; past and cancelled ones newest first", () => {
    const list = [event({ id: "b", start: "2027-01-10T00:00:00.000Z" }), event({ id: "a" }), event({ id: "old", start: "2026-10-01T00:00:00.000Z" }), event({ id: "off", status: "cancelled", start: "2026-12-20T00:00:00.000Z" })];
    const { coming, past } = splitEvents(list, NOW);
    expect(coming.map((e) => e.id)).toEqual(["a", "b"]);
    expect(past.map((e) => e.id)).toEqual(["off", "old"]);
  });
  test("the figures count coming tickets and all the money", () => {
    const list = [event(), event({ id: "d", status: "draft", soldTotal: 0, paidMinor: 0 }), event({ id: "old", start: "2026-10-01T00:00:00.000Z", paidMinor: 5000 })];
    expect(eventFigures(list, NOW)).toMatchObject({ onSale: 1, sold: 12, places: 80, paidMinor: 23000 });
    expect(eventFigures(list, NOW).next?.id).toBe("ev1");
    expect(eventFigures([], NOW)).toEqual({ next: null, onSale: 0, sold: 0, places: 0, paidMinor: 0 });
  });
  test("dates and the sold line read in the shop's zone", () => {
    expect(whenParts("2026-12-06T00:00:00.000Z", ZONE)).toMatchObject({ weekday: "Sat", day: "5", month: "Dec" });
    expect(soldLine(event())).toEqual({ text: "12 of 40 sold", percent: 30 });
    expect(soldLine(event({ placesTotal: 0, soldTotal: 0 })).percent).toBe(0);
  });
  test("the guest list has one row per ticket and no cell that runs as a formula", () => {
    const order = (name: string, codes: string[]): TicketOrder => ({
      id: name, status: "paid", eventId: "ev1", name, email: `${name.toLowerCase()}@example.com`, lines: [], ticketCount: codes.length, totalMinor: 0, taxMinor: 0, chargedMinor: 0,
      currency: "CAD", tickets: codes.map((code) => ({ code, ticketId: "gen", name: "General" })), createdAt: "", paidAt: "", test: false,
    });
    expect(guestCsv([order("Bo", ["BBBB-2222"]), order("=Ada", ["AAAA-2222", "AAAA-3333"])]).split("\n")).toEqual([
      "Name,Email,Ticket,Code,Arrived,Extras", "'=Ada,'=ada@example.com,General,AAAA-2222,,", "'=Ada,'=ada@example.com,General,AAAA-3333,,", "Bo,bo@example.com,General,BBBB-2222,,",
    ]);
    const list = withTicketUsed([order("Bo", ["BBBB-2222"]), order("Ada", ["AAAA-2222", "AAAA-3333"])], "AAAA-3333", "2026-12-05T23:50:00.000Z");
    expect(arrivedCount(list)).toBe(1);
    expect(guestCsv(list).split("\n")[2]).toBe("Ada,ada@example.com,General,AAAA-3333,Yes,");
    const extras = [{ extraId: "prog", name: "Programme", qty: 1, priceMinor: 500 }, { extraId: "drink", name: "Drink", qty: 2, priceMinor: 800 }];
    expect(guestCsv([{ ...order("Cy", ["CCCC-2222"]), extras }]).split("\n")[1]).toBe('Cy,cy@example.com,General,CCCC-2222,,"1 × Programme, 2 × Drink"');
    expect(arrivedCount(withTicketUsed(list, "AAAA-3333", ""))).toBe(0);
    expect(findGuests(list, " ad").map((o) => o.name)).toEqual(["Ada"]);
    expect(findGuests(list, "bbbb 22").map((o) => o.name)).toEqual(["Bo"]);
    expect(findGuests(list, "bo@example").map((o) => o.name)).toEqual(["Bo"]);
    expect(findGuests(list, "")).toHaveLength(2);
    expect(findGuests(list, "zed")).toEqual([]);
  });

  test("a refunded order moves to the end of the list, and picked codes are counted by kind", () => {
    const order = (name: string, codes: string[]): TicketOrder => ({
      id: name, status: "paid", eventId: "ev1", name, email: "", lines: [], ticketCount: codes.length, totalMinor: 0, taxMinor: 0, chargedMinor: 0,
      currency: "CAD", tickets: codes.map((code) => ({ code, ticketId: "gen", name: "General" })), createdAt: "", paidAt: "", test: false,
    });
    const ada = order("Ada", ["AAAA-2222", "AAAA-3333"]);
    const list = withOrderChanged([ada, order("Bo", ["BBBB-2222"])], { ...ada, status: "refunded", tickets: [], refundedMinor: 3000 });
    expect(list.map((o) => o.name)).toEqual(["Bo", "Ada"]);
    expect(countsOfCodes(ada, ["AAAA-3333", "ZZZZ-9999"])).toEqual({ gen: 1 });
  });
});
