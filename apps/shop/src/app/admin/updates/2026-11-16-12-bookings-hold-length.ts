import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookings-hold-length",
  date: "2026-11-16",
  title: "Bookings: choose how long a freed place is held",
  summary: "Hours & rules has a new setting for how long the first person on the waiting list has to book a freed place, from 15 minutes to 12 hours. If they don't book in time, they get a short note and the place goes to the next person. Held places now show on the calendar too, so a class that looks one short tells you why.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
