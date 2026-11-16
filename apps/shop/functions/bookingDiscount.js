// Discount codes on bookings (16 November 2026, bookings plan phase 3). Pure: what a shop discount code takes off one
// booking, in cents. Only a code the owner marked "Works on bookings too" (`forBookings`) counts, and only a plain
// percentage or amount off the whole order (never buy-X-get-Y, tiers, free shipping or a free gift, and never one
// limited to some products). The code's own checks (on, dates, usage limit, who may use it) are the shop's usual ones
// (index.js fetchValidDiscount, validateDiscountCustomer); bookings.js adds the booking side of the usage limit.
"use strict";

const { MIN_CARD_MINOR } = require("./shared/bookingTimes");

class BookingCodeProblem extends Error {
  constructor(message, code = "code") {
    super(message);
    this.code = code;
  }
}

const NOT_FOR_BOOKINGS = "This code can't be used on bookings.";

/** Can this discount be typed on the booking form at all? */
function worksOnBookings(discount) {
  return !!discount && discount.forBookings === true && discount.method !== "automatic"
    && (discount.type === "percentage" || discount.type === "fixed")
    && (!discount.appliesTo || discount.appliesTo === "all");
}

/** Cents off a booking that costs `priceMinor` (never more than the price, never negative). Throws BookingCodeProblem. */
function bookingDiscountMinor(discount, priceMinor) {
  if (!worksOnBookings(discount)) throw new BookingCodeProblem(NOT_FOR_BOOKINGS);
  const price = Math.max(0, Math.round(Number(priceMinor) || 0));
  if (!price) throw new BookingCodeProblem("This booking is free, so there is nothing to take off.");
  const minimum = Math.round((Number(discount.minOrderAmount) || 0) * 100);
  if (minimum > 0 && price < minimum) throw new BookingCodeProblem(`This code needs a booking of at least ${(minimum / 100).toFixed(2)}.`, "min_order");
  const raw = discount.type === "percentage"
    ? Math.round((price * Math.min(100, Math.max(0, Number(discount.value) || 0))) / 100)
    : Math.round(Math.max(0, Number(discount.value) || 0) * 100);
  const cap = Math.round((Number(discount.maxDiscountAmount) || 0) * 100);
  const amount = Math.min(price, cap > 0 ? Math.min(raw, cap) : raw);
  if (amount <= 0) throw new BookingCodeProblem(NOT_FOR_BOOKINGS);
  return amount;
}

/**
 * A card page can't take less than MIN_CARD_MINOR. A code that leaves a little but not enough to pay now is refused,
 * rather than quietly made bigger or smaller.
 */
function tooSmallForCard(upFrontMinor) {
  return upFrontMinor > 0 && upFrontMinor < MIN_CARD_MINOR;
}

module.exports = { worksOnBookings, bookingDiscountMinor, tooSmallForCard, BookingCodeProblem, NOT_FOR_BOOKINGS };
