import type { AppUpdate } from "../appUpdates";

export default {
  id: "booking-run-fixes",
  date: "2026-11-17",
  title: "Repeat bookings: safer around the clock change and late payments",
  summary: "Two fixes for repeat bookings. A visit set for a time the clocks skip in spring (like 2:30 when 2:00 jumps to 3:00) now lands at 3:30, never an hour early at 1:30. And when you cancel the rest of a run, a later visit the client pays for at that very moment stays on, so nobody loses a paid visit. Times everywhere in Bookings follow the same clock-change rule.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
