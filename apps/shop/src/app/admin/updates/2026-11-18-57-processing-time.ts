import type { AppUpdate } from "../appUpdates";

export default {
  id: "processing-time",
  date: "2026-11-18",
  title: "Processing time: fit a short visit into a long one",
  summary: "A service can now have processing time (Beta), like colour setting or a glaze drying. Open a service under Bookings › Services and turn on Processing time, then say when it starts and how long it lasts. While it runs, clients can book a short service with you in that gap, online or from your calendar. The room stays in use, so nothing that needs the same room goes there. The calendar shows the wait as light stripes inside the booking.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
