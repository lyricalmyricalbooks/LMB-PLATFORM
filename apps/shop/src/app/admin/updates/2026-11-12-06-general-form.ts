import type { AppUpdate } from "../appUpdates";

export default {
  id: "general-form",
  date: "2026-11-12",
  title: "Settings › General in the new layout",
  summary: "General now reads like the other new forms: Your shop, Address, Web address, How the shop runs and Store policies are named on the left, with their fields in one card beside them. Shop name and contact email are marked Required, and one bar at the bottom says what is left, with Discard and Save.",
  links: [{ label: "Open General", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
