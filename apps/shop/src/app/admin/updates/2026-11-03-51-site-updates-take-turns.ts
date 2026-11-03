import type { AppUpdate } from "../appUpdates";

export default {
  id: "site-updates-take-turns",
  date: "2026-11-03",
  title: "Site updates take turns, and the one admin speaks your shop's words",
  summary: "When the platform updates many shops at once, each shop's update now waits for the one before it, so one shop's settings can never go out with another's. In the one admin for website and stockroom, the menu says Products instead of Books when you don't sell books, and any new Settings page appears there too.",
  links: [{ label: "Open Settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
