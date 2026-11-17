import type { AppUpdate } from "../appUpdates";

export default {
  id: "booking-check-in",
  date: "2026-11-17",
  title: "Check people in with the code from their booking",
  summary: "Every confirmed booking now has a check-in code in its emails and, as a QR code, on the client's booking page. At the Fair till or on Take a payment, press Check in and type the code, scan it with a barcode scanner or hold their phone up to the camera. You see who it is, when they're booked and what is left to pay, with a button to take it. A booking for another day or a cancelled one is refused in plain words, and you can undo a check-in. The booking's drawer has a Checked in switch, and the calendar marks who is here.",
  links: [{ label: "Take a payment", tab: "takePayment" }, { label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
