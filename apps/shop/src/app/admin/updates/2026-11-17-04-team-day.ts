import type { AppUpdate } from "../appUpdates";

export default {
  id: "team-day",
  date: "2026-11-17",
  title: "Each person's day",
  summary: "Bookings › Calendar has a new Team day view: one column for each person, the day's bookings placed by time, a person who isn't working shaded, and any booking that names nobody in its own column. Give a person an email in Team & rooms and they get their own day's bookings each morning they have any. Each person can also have their own calendar link, with only their bookings, for Google or Apple Calendar on their phone.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
