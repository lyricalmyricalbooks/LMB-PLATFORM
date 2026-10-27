import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-checks",
  date: "2026-10-27",
  title: "Two new automatic checks for checkout",
  summary: "Changes to the shop are now checked further into checkout before they go live: a test browser fills in a name and a Toronto address, picks a delivery option and checks that the payment total shows an amount, without typing an email, pressing Pay or asking for live carrier quotes. A second check proves that choosing local pickup asks for the shopper's province (it sets the tax on any e-books in a pickup order) and keeps their pick.",
  links: [{ label: "Open shipping settings", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
