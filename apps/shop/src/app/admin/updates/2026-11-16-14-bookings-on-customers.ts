import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookings-on-customers",
  date: "2026-11-16",
  title: "Customers: see who booked a time",
  summary: "When your shop takes bookings, each customer's window has a Bookings tab with their times from the past year and the next six months, and the summary says when their next one is. People who booked but never ordered now show as customers too, under Booked, no order yet. On a phone, a customer's window now fits the screen.",
  links: [{ label: "Customers", tab: "customers" }],
} satisfies AppUpdate;
