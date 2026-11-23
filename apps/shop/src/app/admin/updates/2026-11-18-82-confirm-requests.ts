import type { AppUpdate } from "../appUpdates";

export default {
  id: "confirm-requests",
  date: "2026-11-18",
  title: "Clients confirm they're coming",
  summary: "Turn on Ask clients to confirm under Bookings › Hours & rules (Beta). The reminder email then has a \"Yes, I'll be there\" button, and the booking page asks too. Your calendar marks each booking Confirmed or Not confirmed once the reminder has gone, so you know who to call. Moving a booking asks again.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
