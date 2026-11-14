import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookings-card-payments-back",
  date: "2026-11-14",
  title: "Bookings: paid bookings work again",
  summary: "Limiting paid bookings to cards stopped them from starting at all, so that limit is undone. Customers can pay for a booking again.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
