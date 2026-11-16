import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookings-held-place",
  date: "2026-11-16",
  title: "Bookings: a freed place is held for the first person waiting",
  summary: "When someone cancels, the place no longer goes to whoever clicks fastest. It is held for an hour for the first person on the waiting list, who gets an email with a link that books it. If they don't book in time, it goes to the next person. The waiting list shows who is holding a place and until when.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
