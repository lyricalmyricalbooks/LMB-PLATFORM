import type { AppUpdate } from "../appUpdates";

export default {
  id: "drag-bookings",
  date: "2026-11-18",
  title: "Drag a booking to move it",
  summary: "On the Bookings calendar, drag a booking to another time or day to move it. On the team's day, drag it to someone else. Pull a booking's bottom edge to make it longer or shorter; the price stays as booked. Before anything changes, you see the old and new time and choose whether the client gets an email about it. On a phone, open the booking and use Move.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
