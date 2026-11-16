import type { AppUpdate } from "../appUpdates";

export default {
  id: "booking-pay-rest",
  date: "2026-11-16",
  title: "Bookings: clients can pay what's left by card",
  summary: "When a booking still has money to pay, after a deposit or for a service paid at the shop, open it in Bookings to see what's left. Copy a pay link, email it to the client, or show a QR code at the desk. They pay by card on your own payment page, get a receipt, and the booking shows as paid in full. Clients also see a Pay button on their own booking page. A cancel refunds the later payment first, then the deposit.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
