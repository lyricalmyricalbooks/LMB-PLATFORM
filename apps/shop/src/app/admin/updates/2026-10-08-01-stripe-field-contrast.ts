import type { AppUpdate } from "../appUpdates";

export default {
  id: "stripe-field-contrast", date: "2026-10-08", title: "Readable card payment fields",
  summary: "Card fields and country menus automatically use readable text when checkout field colours have too little contrast. Labels still follow your checkout design.",
  links: [{ label: "Review checkout design", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
