import type { AppUpdate } from "../appUpdates";

export default {
  id: "booking-card-on-file",
  date: "2026-11-16",
  title: "Card on file and a fee for missed bookings",
  summary: "A service can now keep a card on file. Clients save a card when they book, and nothing is taken for it. If someone doesn't turn up, or you cancel for them late, open the booking and press Charge fee: the fee goes on their card once, up to the amount they agreed to, and they get an email receipt. Clients see the fee before they book, and on their booking emails. A client who cancels online in time is never charged. This needs Stripe; Square shops book as before. Bookings is still a beta.",
  links: [{ label: "Calendar", tab: "bookings" }],
} satisfies AppUpdate;
