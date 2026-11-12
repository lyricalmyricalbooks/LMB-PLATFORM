import type { AppUpdate } from "../appUpdates";

export default {
  id: "connection-check",
  date: "2026-11-12",
  title: "We check your connections every night",
  summary: "Each night Colophon checks that your shop's links to Google, QuickBooks, Facebook & Instagram, Pinterest and TikTok still work. If one stops, for example after you change a password, we see it the next morning and can tell you where to connect it again.",
  links: [{ label: "Open Apps", tab: "settings", settingsTab: "apps" }],
} satisfies AppUpdate;
