import type { AppUpdate } from "../appUpdates";

export default {
  id: "rate-page-polish",
  date: "2026-11-15",
  title: "Shipping rate page only warns when you changed something",
  summary: "Opening a shipping rate no longer says \"Unsaved changes\" before you type anything, and leaving after a change asks first so nothing is lost by accident. Days in transit now shows only when a carrier is connected, so shoppers never see a delivery promise nobody checked.",
  links: [{ label: "Shipping", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
