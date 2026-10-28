import type { AppUpdate } from "../appUpdates";

export default {
  id: "shop-data-updates",
  date: "2026-10-28",
  title: "Safer updates to your shop's saved information",
  summary: "When an update needs to change how your books, orders or settings are stored, the change now runs once, in order, and is written down in your shop, so running the update again never repeats it. If one stops part-way, nothing is lost: it is tried again with the next update. Each change appears in Activity logs as \"Shop updates\". There is nothing new to do on your side.",
  links: [{ label: "Open General settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
