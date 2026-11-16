import type { AppUpdate } from "../appUpdates";

export default {
  id: "booking-gift-cards",
  date: "2026-11-16",
  title: "Bookings: customers can pay with a gift card",
  summary: "Your Book a time page now has a Have a gift card? link on services paid when booked. The gift card pays all or part of the price or deposit, and the card page asks only for what is left; when it covers everything, the booking is made straight away. The balance comes off when the time is taken, so one card can't pay twice. Cancelling puts it back on the card, and when you cancel you can choose to keep it instead. Each gift card's history shows its bookings.",
  links: [{ label: "Bookings", tab: "bookings" }, { label: "Gift cards", tab: "giftCards" }],
} satisfies AppUpdate;
