import type { AppUpdate } from "../appUpdates";

export default {
  id: "rebook-reminders",
  date: "2026-11-17",
  title: "Reminders to book again",
  summary: "Each service can now remind customers to come back. In Bookings, edit a service and pick Remind them to come back, say After 6 weeks. Six weeks after a visit the customer gets one short email with a Book your next visit button that opens the same service with the same person. Anyone who has already booked again, missed the visit or unsubscribed gets nothing.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
