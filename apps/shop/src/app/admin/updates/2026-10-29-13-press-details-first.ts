import type { AppUpdate } from "../appUpdates";

export default {
  id: "press-details-first",
  date: "2026-10-29",
  title: "Tell us about your press first",
  summary: "A new shop's first screen now asks for the press's name, contact email and street address before it offers a look. Those details go on receipts, labels and the contact page, and they stay in Settings to change later.",
  links: [{ label: "Open shop details", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
