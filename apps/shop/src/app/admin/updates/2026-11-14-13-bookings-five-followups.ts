import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookings-five-followups",
  date: "2026-11-14",
  title: "Bookings: reminder choices, partial refunds and clearer payments",
  summary: "Choose when the reminder email goes out, or turn it off, in Hours & rules. The reminder now has a button to cancel or move the booking. When you cancel a paid booking you can refund all, part or none of it. A bank payment that is still clearing shows as Payment clearing on your calendar, and if it never clears, you and the customer both get an email.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
