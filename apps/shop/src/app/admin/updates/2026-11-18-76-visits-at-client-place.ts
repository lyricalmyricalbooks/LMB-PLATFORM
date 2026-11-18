import type { AppUpdate } from "../appUpdates";

export default {
  id: "visits-at-client-place",
  date: "2026-11-18",
  title: "Bookings at the client's place",
  summary: "A service can now be a visit to the client (Beta). Turn on Visit them at their place in the service, and clients give their street, city and postal code when they book. List the postal codes you travel to, and set Time before to your travel time.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
