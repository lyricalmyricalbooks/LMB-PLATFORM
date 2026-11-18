import type { AppUpdate } from "../appUpdates";

export default {
  id: "your-shop-settings",
  date: "2026-11-18",
  title: "Settings › General is now Your shop",
  summary: "Your shop holds just your name, address, web address, policies and whether the shop is open, all on one page. Google Analytics, Search Console and Clarity moved to Settings › Google, the AI writer moved to Apps, backups and downloads have their own Your data page, and old link forwarding sits in Online store.",
  links: [{ label: "Your shop", tab: "settings", settingsTab: "general" }, { label: "Your data", tab: "settings", settingsTab: "data" }],
} satisfies AppUpdate;
