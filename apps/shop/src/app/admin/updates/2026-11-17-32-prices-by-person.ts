import type { AppUpdate } from "../appUpdates";

export default {
  id: "prices-by-person",
  date: "2026-11-17",
  title: "Prices and lengths by person (Beta)",
  summary: "A senior stylist can now charge more, or take longer, than a junior one for the same service. Set it under Bookings, Team, edit a person, Their prices and lengths; leave a box empty to use the service's own. Clients see each person's price and length on your Book a time page when they pick who they'd like, and only times long enough for that person are offered. Anyone free keeps the service's own price. Add-ons go on top, and a booking keeps the price it was made at. Classes, courses and free services are not changed. This has not been tried on a live shop yet.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
