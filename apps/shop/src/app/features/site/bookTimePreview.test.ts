import { describe, expect, it } from "vitest";
import { previewAnswer, SAMPLE_BOOKING_ID, SAMPLE_BOOKING_KEY } from "./bookTimePreview";
import { manageFromSearch } from "./bookTimeRules";
import { bookingsLinkShown } from "./bookingsLive";

const NOW = Date.parse("2026-11-16T15:00:00Z"); // a Monday
const ZONE = "America/Toronto";
const ask = (action: string, body: Record<string, any> = {}) => previewAnswer(action, body, "USD", NOW, ZONE);

describe("the Book a time page in Studio's preview", () => {
  it("offers sample services in the shop's own currency", () => {
    const info = ask("bookingInfo");
    expect(info).toMatchObject({ on: true, currency: "USD", today: "2026-11-16", zone: ZONE });
    expect(info.services.length).toBeGreaterThan(1);
    expect(info.services.some((s: any) => s.priceMinor > 0) && info.services.some((s: any) => s.priceMinor === 0)).toBe(true);
  });

  it("shows times on open days and none today or on a Sunday, so both looks can be designed", () => {
    const { days } = ask("bookingTimes", { from: "2026-11-16", days: 7 });
    expect(Object.keys(days)).toHaveLength(7);
    expect(days["2026-11-16"]).toEqual([]);
    expect(days["2026-11-22"]).toEqual([]);
    expect(days["2026-11-17"][0]).toBe("2026-11-17T15:00:00.000Z"); // 10:00 in Toronto
  });

  it("shows the sample class with one full time a day, and joining its waiting list answers at once", () => {
    const times = ask("bookingTimes", { serviceId: "sample-class", from: "2026-11-17", days: 1 });
    expect(times.full["2026-11-17"]).toHaveLength(1);
    expect(times.days["2026-11-17"]).not.toContain(times.full["2026-11-17"][0]);
    expect(Object.values(times.left).every((n) => (n as number) >= 0)).toBe(true);
    expect(ask("bookingWait", { serviceId: "sample-class", start: times.full["2026-11-17"][0] })).toEqual({ ok: true });
  });

  it("books, moves and cancels one sample booking without a server", () => {
    const started = ask("bookingStart", { serviceId: "sample-session", start: "2026-11-18T16:00:00.000Z" });
    expect(started).toEqual({ id: SAMPLE_BOOKING_ID, key: SAMPLE_BOOKING_KEY });
    expect(manageFromSearch(`?booking=${started.id}&key=${started.key}`)).toEqual(started);
    expect(ask("bookingView").booking).toMatchObject({ status: "confirmed", start: "2026-11-18T16:00:00.000Z", end: "2026-11-18T17:00:00.000Z", paid: true });
    expect(ask("bookingMove", { start: "2026-11-19T15:00:00.000Z" }).booking.start).toBe("2026-11-19T15:00:00.000Z");
    expect(ask("bookingCancel").booking).toMatchObject({ status: "cancelled", refunded: true, canChange: false });
  });

  it("shows paying what is left after a deposit, with no card page", () => {
    ask("bookingStart", { serviceId: "sample-class", start: "2026-11-21T19:00:00.000Z" });
    expect(ask("bookingView").booking).toMatchObject({ canPayRest: true, dueMinor: 4000, restPaidMinor: 0 });
    const paid = ask("bookingPayRest").booking;
    expect(paid).toMatchObject({ canPayRest: false, dueMinor: 0, restPaidMinor: 4000 });
    expect(paid.url).toBeUndefined();
  });
});

describe("the header's Book a time link", () => {
  it("shows only while bookings are on and the owner hasn't hidden it", () => {
    expect(bookingsLinkShown(true, {})).toBe(true);
    expect(bookingsLinkShown(false, {})).toBe(false);
    expect(bookingsLinkShown(true, { hideHeaderBookings: true })).toBe(false);
  });

  it("takes 10% off a paid sample service for any code, and the booking shows it", () => {
    expect(ask("bookingInfo").codes).toBe(true);
    expect(ask("bookingCode", { serviceId: "sample-class", code: "spring" })).toEqual({ code: "SPRING", discountMinor: 600, priceMinor: 5400, payNowMinor: 2000 });
    expect(() => ask("bookingCode", { serviceId: "sample-visit", code: "SPRING" })).toThrow();
    ask("bookingStart", { serviceId: "sample-session", start: "2026-11-18T15:00:00.000Z", code: "SPRING" });
    expect(ask("bookingView").booking).toMatchObject({ priceMinor: 4050, discountCode: "SPRING", discountMinor: 450 });
  });
});
