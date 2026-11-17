import type { AppUpdate } from "../appUpdates";

export default {
  id: "square-terminal-tips",
  date: "2026-11-17",
  title: "Take a payment: Square Terminal, and tips on the card reader",
  summary: "Shops on Square can now add a Square Terminal on Take a payment: press Add a reader, get a short code, and type it on the Terminal's sign-in screen. Payments then go straight to it, as they already did for Stripe readers. If you ask clients for tips (Bookings, Hours & rules, Tips), the reader now asks for one before the card, using your tip choices, and the tip shows on the booking apart from the price. A Square shop connected before today needs to connect Square again once to use a Terminal. This has not been tried with a real reader yet.",
  links: [{ label: "Take a payment", tab: "takePayment" }, { label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
