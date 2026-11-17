import type { AppUpdate } from "../appUpdates";

export default {
  id: "team-google-calendars",
  date: "2026-11-17",
  title: "Each person's own Google Calendar blocks their busy times (Beta)",
  summary: "In Bookings › Team & rooms, open a person and send them a link to their own Google Calendar. Once they link it, times they are busy in Google can't be booked with them, and nobody else's times change. Only busy and free is read, never what the events are. Unlink any time. This opens once Google has approved the calendar permission; until then the box says Coming soon. It has not been tried on a live shop yet.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
