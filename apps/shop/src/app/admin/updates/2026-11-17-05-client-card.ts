import type { AppUpdate } from "../appUpdates";

export default {
  id: "client-card",
  date: "2026-11-17",
  title: "A card for each client",
  summary: "Open a client in Clients to see their card: how many visits, what they spent on bookings, any missed visits, their next visit, their phone, the saved card, packs still to use and their latest booking answers. Book again opens a new booking with the same service and person, already filled in. Private notes are for you and your team only, and Bring clients over now reads the client list an old booking tool exports, with phones, visits and missed visits.",
  links: [{ label: "Clients", tab: "customers" }],
} satisfies AppUpdate;
