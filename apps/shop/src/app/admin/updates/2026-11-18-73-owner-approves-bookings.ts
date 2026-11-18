import type { AppUpdate } from "../appUpdates";

export default {
  id: "owner-approves-bookings",
  date: "2026-11-18",
  title: "Check bookings before they're confirmed",
  summary: "A free or pay-at-the-shop service can ask you first (Beta). Open Bookings, then a service, and turn on Ask me before confirming. Clients send a request that holds the time, and a Requests box at the top of the calendar lists them with how long you have left to answer. Accept sends the confirmation email. Decline lets you add a short reason for the client. A request you don't answer within two days is declined for you, and clients can withdraw a request from their booking page.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
