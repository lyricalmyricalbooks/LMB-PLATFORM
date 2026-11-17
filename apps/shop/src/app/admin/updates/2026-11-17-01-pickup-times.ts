import type { AppUpdate } from "../appUpdates";

export default {
  id: "pickup-times",
  date: "2026-11-17",
  title: "Shoppers can choose a pickup time at checkout",
  summary: "Turn on Pickup times in Bookings › Hours & rules and shoppers who choose to pick up their order pick a day and time from your opening hours, skipping your days off. You choose how far apart the times are, how many orders fit in one time and how long you need to get an order ready. A full time disappears, and the shop checks the time again before taking payment, so two people can't squeeze past the limit. The time shows on the order, in the order emails and on the shopper's order page.",
  links: [{ label: "Bookings", tab: "bookings" }, { label: "Orders", tab: "orders" }],
} satisfies AppUpdate;
