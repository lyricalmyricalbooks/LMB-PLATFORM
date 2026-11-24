import type { AppUpdate } from "../appUpdates";

export default {
  id: "no-shows",
  date: "2026-11-18",
  title: "See who misses bookings and what it costs",
  summary: "Bookings › Figures now has a No-shows report (Beta): how many booked visits nobody came to, the money they cost, what you kept anyway from deposits and fees, which weekdays they happen on and which clients miss most. Clients who missed twice or more are marked. Save it as a spreadsheet.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
