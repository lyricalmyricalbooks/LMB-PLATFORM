import type { AppUpdate } from "../appUpdates";

export default {
  id: "booking-discount-codes",
  date: "2026-11-16",
  title: "Bookings: discount codes customers can type when they book",
  summary: "Open a discount code under Discounts and switch on Works on bookings too. Customers then see a Have a discount code? link on your Book a time page, and the price, the deposit and the card page all follow the code. A booking counts toward the code's usage limit, and a cancelled booking gives the use back. It works for codes that take a percentage or an amount off the whole order, not free shipping or buy-one-get-one codes.",
  links: [{ label: "Discounts", tab: "discounts" }, { label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
