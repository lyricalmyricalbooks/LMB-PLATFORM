import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookings-reminders",
  date: "2026-11-14",
  title: "Bookings: a reminder the day before",
  summary: "Customers now get one email about a day before their booking, with the time, place and a calendar link. Bookings made only hours ahead skip it. A customer who pays by a slower bank method keeps their time while the payment clears.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
