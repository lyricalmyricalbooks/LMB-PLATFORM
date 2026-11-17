// Discount codes on event tickets (beta, 17 November 2026). Pure: what a shop discount code takes off one ticket
// order, in cents. Only a code the owner marked "Works on event tickets too" (`forTickets`) counts, and only a plain
// percentage or amount off the whole order (the same kind Bookings takes, bookingDiscount.js). The code's own checks
// (on, dates, usage limit, who may use it) are the shop's usual ones; events.js adds the tickets' side of the limits.
"use strict";

const { plainCode, codeAmountMinor, BookingCodeProblem: TicketCodeProblem } = require("./bookingDiscount");
const { MIN_TICKET_MINOR } = require("./shared/eventTickets");

const NOT_FOR_TICKETS = "This code can't be used on tickets.";
const WORDS = {
  notFor: NOT_FOR_TICKETS, free: "These tickets are free, so there is nothing to take off.",
  minimum: (amount) => `This code needs tickets worth at least ${amount}.`,
};

/** Can this discount be typed on the Events page at all? */
function worksOnTickets(discount) {
  return plainCode(discount) && discount.forTickets === true;
}

/** Cents off tickets that cost `totalMinor` before tax (never more than that). Throws TicketCodeProblem. */
function ticketDiscountMinor(discount, totalMinor) {
  if (!worksOnTickets(discount)) throw new TicketCodeProblem(NOT_FOR_TICKETS);
  return codeAmountMinor(discount, totalMinor, WORDS);
}

/** A card page can't take a few cents: a code that leaves less than the smallest ticket price to pay is refused. */
function tooSmallForCard(chargedMinor) {
  return chargedMinor > 0 && chargedMinor < MIN_TICKET_MINOR;
}

module.exports = { worksOnTickets, ticketDiscountMinor, tooSmallForCard, TicketCodeProblem, NOT_FOR_TICKETS };
