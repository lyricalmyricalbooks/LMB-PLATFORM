// Discount codes on bookings (bookingDiscount.js): only codes the owner marked for bookings, only a plain amount or
// percentage off the whole order, never more than the price, and a leftover too small for a card page is refused.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const { worksOnBookings, bookingDiscountMinor, tooSmallForCard, BookingCodeProblem } = createRequire(import.meta.url)("./bookingDiscount");

const code = (extra = {}) => ({ forBookings: true, type: "percentage", value: 10, ...extra });

describe("which codes work on bookings", () => {
  test("only percentage or amount codes on the whole order that the owner marked", () => {
    expect(worksOnBookings(code())).toBe(true);
    expect(worksOnBookings(code({ type: "fixed", appliesTo: "all" }))).toBe(true);
    expect(worksOnBookings(code({ forBookings: false }))).toBe(false);
    expect(worksOnBookings(code({ forBookings: "true" }))).toBe(false);
    expect(worksOnBookings(code({ method: "automatic" }))).toBe(false);
    for (const type of ["freeship", "bogo", "tiered", "gift"]) expect(worksOnBookings(code({ type }))).toBe(false);
    expect(worksOnBookings(code({ appliesTo: "products" }))).toBe(false);
    expect(worksOnBookings(null)).toBe(false);
  });
});

describe("what a code takes off", () => {
  test("a percentage, rounded to the cent and capped at the code's most", () => {
    expect(bookingDiscountMinor(code({ value: 15 }), 4999)).toBe(750);
    expect(bookingDiscountMinor(code({ value: 50, maxDiscountAmount: 10 }), 4000)).toBe(1000);
    expect(bookingDiscountMinor(code({ value: 250 }), 4000)).toBe(4000);
  });

  test("an amount never takes more than the price", () => {
    expect(bookingDiscountMinor(code({ type: "fixed", value: 12.5 }), 4000)).toBe(1250);
    expect(bookingDiscountMinor(code({ type: "fixed", value: 80 }), 4000)).toBe(4000);
  });

  test("a minimum the booking doesn't reach, a free booking or nothing off are refused", () => {
    expect(() => bookingDiscountMinor(code({ minOrderAmount: 50 }), 4000)).toThrow(/at least 50\.00/);
    expect(() => bookingDiscountMinor(code(), 0)).toThrow(BookingCodeProblem);
    expect(() => bookingDiscountMinor(code({ value: 0 }), 4000)).toThrow(BookingCodeProblem);
    expect(() => bookingDiscountMinor(code({ forBookings: false }), 4000)).toThrow("This code can't be used on bookings.");
  });

  test("a card page can't take a few cents", () => {
    expect(tooSmallForCard(0)).toBe(false);
    expect(tooSmallForCard(49)).toBe(true);
    expect(tooSmallForCard(50)).toBe(false);
  });
});
