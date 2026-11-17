import type { AppUpdate } from "../appUpdates";

export default {
  id: "events-codes",
  date: "2026-11-17",
  title: "Events (Beta): discount codes on tickets",
  summary: "A discount code can now work on event tickets. Open a code in Discounts and switch on Works on event tickets too; buyers then see a Have a code? box when they choose tickets, with the saving and new total shown before they pay. The code's limits still count (dates, number of uses, one per customer), a use is given back when an order isn't paid or is fully refunded, and Who's coming shows which code each order used. Refunds give back what the guest really paid. Not yet tried against a real payment account.",
  links: [
    { label: "Discounts", tab: "discounts" },
    { label: "Events", tab: "events" },
  ],
} satisfies AppUpdate;
