import type { AppUpdate } from "../appUpdates";

export default {
  id: "book-over",
  date: "2026-11-18",
  title: "Book over a taken time when you mean to",
  summary: "Tapped a time on the Bookings calendar that's already taken? The new booking form now says so and offers Book anyway. Dragging a booking onto someone else's time does the same: you see a plain warning first and choose Move anyway. Both bookings stay on your calendar. Clients booking online still only see free times, and classes never take more people than their places.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
