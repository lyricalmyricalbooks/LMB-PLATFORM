import type { AppUpdate } from "../appUpdates";

export default {
  id: "booking-packs",
  date: "2026-11-16",
  title: "Bookings: sell packs of visits",
  summary: "A paid service can now sell a pack, such as 5 visits for less than 5 single ones, to use within a time you choose. Customers buy it from your Book a time page, get a code by email and book each visit with it, with nothing to pay. Cancelling puts the visit back on the pack, unless you choose to keep it. The new Packs tab shows who has visits left and lets you close a pack with a refund. The page's heading now also shows the price after a discount code.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
