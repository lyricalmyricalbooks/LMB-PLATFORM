import type { AppUpdate } from "../appUpdates";

export default {
  id: "your-data",
  date: "2026-11-02",
  title: "Shoppers can download or delete their own data",
  summary: "A signed-in shopper now has a Your data card in their account. They can download a copy of what the shop holds about them, or ask for it to be deleted. A deletion request arrives marked as confirmed, because they are signed in, and nothing is deleted until you press Approve and delete in Settings › General › Privacy requests. Orders they paid for stay on file for tax records.",
  links: [{ label: "Open privacy requests", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
