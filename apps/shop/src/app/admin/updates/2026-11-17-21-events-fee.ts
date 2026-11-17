import type { AppUpdate } from "../appUpdates";

export default {
  id: "events-fee",
  date: "2026-11-17",
  title: "Events (Beta): your own booking fee",
  summary: "You can add a small booking fee to each paid ticket, to help with card costs. Edit an event and fill in Booking fee per paid ticket; leave it empty for none. The money is yours, not Colophon's. Buyers see the fee beside the ticket price and in the total before they pay, free tickets never carry it, and it goes back with a ticket you refund. Not yet tried against a real payment account.",
  links: [{ label: "Events", tab: "events" }],
} satisfies AppUpdate;
