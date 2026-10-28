import type { AppUpdate } from "../appUpdates";

export default {
  id: "own-gmail-first",
  date: "2026-10-28",
  title: "Send shop emails from your own Gmail",
  summary: "Settings › Email sender now starts with Send from your own Gmail, which shows the address your receipts and customer emails will come from. Once you connect it, every shop email goes from your Gmail. Until then, or if Gmail ever refuses an email, a shop that is set up for it sends from a shared sending address with your shop's name on it, and replies still come to you.",
  links: [{ label: "Open Email sender", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
