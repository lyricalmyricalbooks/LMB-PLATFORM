import type { AppUpdate } from "../appUpdates";

export default {
  id: "rate-page",
  date: "2026-11-14",
  title: "Shipping rates open as their own page",
  summary: "Adding or changing a shipping rate now opens a full page in the new form layout instead of a crowded pop-up: the rate and its price first, then when to offer it, then a switch to turn it on or off. Save rate takes you back to the profile.",
  links: [{ label: "Shipping", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
