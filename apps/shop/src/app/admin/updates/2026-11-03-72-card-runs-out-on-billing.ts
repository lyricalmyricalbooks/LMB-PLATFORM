import type { AppUpdate } from "../appUpdates";

export default {
  id: "card-runs-out-on-billing",
  date: "2026-11-03",
  title: "Billing warns you before your card runs out",
  summary: "When the card that pays your plan runs out within a month, or already has, Settings, Billing now says so at the top with an Add a card button. The warning stays until a new card is saved, so a missed email can't close your shop by surprise.",
  links: [{ label: "Open Billing", tab: "settings", settingsTab: "billing" }],
} satisfies AppUpdate;
