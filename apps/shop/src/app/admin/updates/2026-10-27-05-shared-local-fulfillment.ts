import type { AppUpdate } from "../appUpdates";

export default {
  id: "shared-local-fulfillment",
  date: "2026-10-27",
  title: "One copy of the pickup and local delivery rules",
  summary: "Checkout, your delivery settings and the server now check pickup spots and delivery zones, and price them, with the very same code, so those rules can no longer drift apart between the bag and the payment step. Nothing about your pickup or delivery settings changes.",
  links: [{ label: "Open shipping settings", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
