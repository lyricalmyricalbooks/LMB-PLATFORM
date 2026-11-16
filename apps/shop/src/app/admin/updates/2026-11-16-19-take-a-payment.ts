import type { AppUpdate } from "../appUpdates";

export default {
  id: "take-a-payment",
  date: "2026-11-16",
  title: "Take a payment at the desk",
  summary: "A new Take a payment page for shops with Bookings. Pick a service and the client's name, or a booking with something left to pay today, and show a QR code. The client scans it with their phone and pays by card, with a tip if they like. The screen says Paid as soon as the money is in. It works without a card reader.",
  links: [{ label: "Take a payment", tab: "takePayment" }],
} satisfies AppUpdate;
