import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookings-waiting-list",
  date: "2026-11-14",
  title: "Bookings: a waiting list for full classes and booked-up days",
  summary: "When a class time is full or a day is booked up, customers can leave their name and email on your Book a time page. The moment a place opens (someone cancels, you move them, or a payment isn't finished) each person waiting gets one email with a link to book. Nothing is held, so the first to book gets the place. Your calendar shows how many are waiting on each day; click the count to see who, or to remove someone.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
