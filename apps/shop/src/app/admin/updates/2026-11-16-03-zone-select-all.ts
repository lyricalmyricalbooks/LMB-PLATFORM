import type { AppUpdate } from "../appUpdates";

export default {
  id: "zone-select-all",
  date: "2026-11-16",
  title: "Select all states at once, and see any left out",
  summary: "Each country's provinces and states on a shipping zone now have Select all and Clear, so picking most of them takes two taps. Your shipping profile also tells you when some Canadian provinces or US states aren't in any zone, so shoppers there would have no shipping price, with a button to add a zone.",
  links: [{ label: "Open Shipping", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
