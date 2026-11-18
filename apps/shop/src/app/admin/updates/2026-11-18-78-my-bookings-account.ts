import type { AppUpdate } from "../appUpdates";

export default {
  id: "my-bookings-account",
  date: "2026-11-18",
  title: "Clients see their bookings in their account",
  summary: "When a client signs in to their account on your website, a Your bookings box lists their coming visits and their recent past ones (Beta). Open takes them to the booking to move or cancel it, without hunting for the email, and Book again starts a new booking of the same service.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
