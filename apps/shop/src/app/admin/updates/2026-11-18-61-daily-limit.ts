import type { AppUpdate } from "../appUpdates";

export default {
  id: "daily-limit",
  date: "2026-11-18",
  title: "A limit on online bookings each day",
  summary: "You can now cap how many bookings clients make online on one day (Beta). Choose Most online bookings a day under Bookings › Hours & rules. Once a day has that many, the booking page shows no more times for it. You can still add more yourself from the calendar.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
