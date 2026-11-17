import type { AppUpdate } from "../appUpdates";

export default {
  id: "booking-thank-you-email",
  date: "2026-11-17",
  title: "A thank-you email after each visit",
  summary: "Bookings › Hours & rules has a new After the visit box. Turn on Send a thank-you email and, a couple of hours after each visit, the client gets a short thank-you with a Book again button. Paste your review link (your Google review link, say) and the email also asks for a review. No-shows and cancelled bookings get nothing, and if you ask for tips, the tip email says thank you instead, so nobody gets two emails.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
