// The Events page's own sums and link reading (eventsRules.ts), and Studio's sample answers (eventsPreview.ts).
import { describe, expect, it } from "vitest";
import { cartOf, clampQty, extrasOf, feeOf, codeText, eventDayParts, eventFromSearch, eventState, eventWhenText, lowestPrice, orderFromSearch, type EventView } from "./eventsRules";
import { previewEventsAnswer, SAMPLE_EVENT_KEY, SAMPLE_EVENT_ORDER } from "./eventsPreview";

const ZONE = "America/Toronto";
const event = (over: Partial<EventView> = {}): EventView => ({
  id: "launch01", title: "Launch", start: "2026-12-05T19:00:00-05:00", end: "2026-12-05T22:00:00-05:00", online: false, open: true, cancelled: false,
  tickets: [
    { id: "gen", name: "General", priceMinor: 1500, maxPerOrder: 6, left: 3, soldOut: false, taxMinor: 195 },
    { id: "free", name: "Friend", priceMinor: 0, maxPerOrder: 2, left: 2, soldOut: false },
    { id: "gone", name: "Student", priceMinor: 800, maxPerOrder: 2, left: 0, soldOut: true },
  ],
  ...over,
});

describe("links", () => {
  it("reads the buyer's own link only when both parts are well formed", () => {
    const key = "a".repeat(48);
    expect(orderFromSearch(`?order=order0001&key=${key}`)).toEqual({ id: "order0001", key });
    expect(orderFromSearch(`?order=order0001&key=${key.slice(1)}`)).toBeNull();
    expect(orderFromSearch(`?order=<x>&key=${key}`)).toBeNull();
    expect(orderFromSearch("")).toBeNull();
  });
  it("reads the event a link opens", () => {
    expect(eventFromSearch("?event=launch01&preview=true")).toBe("launch01");
    expect(eventFromSearch("?event=../x")).toBe("");
  });
});

describe("dates in the shop's zone", () => {
  it("gives the card's date block", () => {
    expect(eventDayParts("2026-12-06T02:00:00Z", ZONE, "en-CA")).toEqual({ month: "Dec", day: "5", weekday: "Sat" });
  });
  it("says start and end on one day, the start alone with no end, and both days when it runs past midnight", () => {
    const one = eventWhenText("2026-12-05T19:00:00-05:00", "2026-12-05T22:00:00-05:00", ZONE, "en-CA");
    expect(one).toMatch(/^Saturday,? (5 December|December 5), 7:00\s?p\.m\. – 10:00\s?p\.m\.$/);
    expect(eventWhenText("2026-12-05T19:00:00-05:00", "", ZONE, "en-CA")).not.toContain("–");
    expect(eventWhenText("2026-12-05T19:00:00-05:00", "2026-12-06T01:00:00-05:00", ZONE, "en-CA")).toContain("Sunday");
    expect(eventWhenText("2026-12-05T19:00:00-05:00", "2026-12-05T18:00:00-05:00", ZONE, "en-CA")).not.toContain("–");
  });
});

describe("prices and states", () => {
  it("shows the cheapest ticket still to be had", () => {
    expect(lowestPrice(event())).toBe(0);
    expect(lowestPrice(event({ tickets: event().tickets.filter((t) => t.id !== "free") }))).toBe(1500);
    expect(lowestPrice(event({ tickets: [] }))).toBeNull();
  });
  it("names an event's state", () => {
    expect(eventState(event())).toBe("open");
    expect(eventState(event({ cancelled: true }))).toBe("cancelled");
    expect(eventState(event({ open: false }))).toBe("closed");
    expect(eventState(event({ tickets: event().tickets.map((t) => ({ ...t, left: 0, soldOut: true })) }))).toBe("soldOut");
  });
});

describe("the picks", () => {
  it("never go past what is left, under zero or onto a sold-out ticket", () => {
    const [gen, , gone] = event().tickets;
    expect(clampQty(gen, 9)).toBe(3);
    expect(clampQty(gen, -1)).toBe(0);
    expect(clampQty(gen, Number.NaN)).toBe(0);
    expect(clampQty(gone, 1)).toBe(0);
  });
  it("become what the server is asked for, with the page's total before tax", () => {
    expect(cartOf(event(), { gen: 2, free: 5, gone: 1, nope: 3 })).toEqual({ tickets: { gen: 2, free: 2 }, count: 4, totalMinor: 3000, taxed: true });
    expect(cartOf(event(), { free: 1 })).toEqual({ tickets: { free: 1 }, count: 1, totalMinor: 0, taxed: false });
    expect(cartOf(event(), {})).toEqual({ tickets: {}, count: 0, totalMinor: 0, taxed: false });
    const withExtras = { extras: [{ id: "prog", name: "Programme", priceMinor: 500, maxPerOrder: 10, taxMinor: 65 }, { id: "drink", name: "Drink", priceMinor: 800, maxPerOrder: 2 }] };
    expect(extrasOf(withExtras, { prog: 1, drink: 9, nope: 2 })).toEqual({ extras: { prog: 1, drink: 2 }, totalMinor: 2100, taxed: true });
    expect(extrasOf(withExtras, { drink: -1 })).toEqual({ extras: {}, totalMinor: 0, taxed: false });
    expect(extrasOf({}, { prog: 1 })).toEqual({ extras: {}, totalMinor: 0, taxed: false });
    expect(feeOf({ ...event(), feeMinor: 150 }, { gen: 2, free: 2 })).toBe(300);
    expect(feeOf(event(), { gen: 2 })).toBe(0);
  });
  it("spaces a long code and leaves a dashed one alone", () => {
    expect(codeText("ABCD2345EFGH")).toBe("ABCD 2345 EFGH");
    expect(codeText("TICK-2222")).toBe("TICK-2222");
  });
});

describe("Studio's sample answers", () => {
  const now = Date.parse("2026-11-17T13:00:00Z");
  it("lists coming sample events, one with a sold-out ticket and one sold out", () => {
    const info = previewEventsAnswer("eventsInfo", {}, "CAD", now, ZONE);
    expect(info.on).toBe(true);
    expect(info.events.every((e: EventView) => Date.parse(e.start) > now)).toBe(true);
    expect(info.events.map(eventState)).toEqual(["open", "open", "soldOut"]);
  });
  it("makes a sample order from the picks and shows it back, with no card page", () => {
    const made = previewEventsAnswer("eventStart", { eventId: "sample-launch", tickets: { general: 2, supporter: 1 }, name: "Ada" }, "USD", now, ZONE);
    expect(made).toEqual({ orderId: SAMPLE_EVENT_ORDER, key: SAMPLE_EVENT_KEY, paid: true });
    const { order } = previewEventsAnswer("eventView", {}, "USD", now, ZONE);
    expect(order).toMatchObject({ status: "paid", name: "Ada", feeMinor: 300, totalMinor: 7300, chargedMinor: 7300, currency: "USD" });
    expect(order.tickets).toHaveLength(3);
    expect(orderFromSearch(`?order=${SAMPLE_EVENT_ORDER}&key=${SAMPLE_EVENT_KEY}`)).not.toBeNull();
  });
});
