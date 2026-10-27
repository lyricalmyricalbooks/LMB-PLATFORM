import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-sub-tabs",
  date: "2026-10-20",
  title: "Long admin pages are split into sub tabs",
  summary: "Four long pages now show one topic at a time under sub tabs, instead of one long scroll. Settings › General has Shop status & checkout, Shop details, Visitors & Google, and Tools & records. Settings › Payments has Ready to take payments?, Ways to pay, and On the shop & related settings. Settings › Email sender has Emails, Sending setup and Deliveries. Inventory has Stock and Inventory app link. A dot on a sub tab means it has changes you haven't saved yet, and the Save bar still saves every sub tab at once. Nothing you type is lost when you switch sub tabs.",
  links: [
    { label: "General", tab: "settings", settingsTab: "general" },
    { label: "Payments", tab: "settings", settingsTab: "payments" },
    { label: "Email sender", tab: "settings", settingsTab: "notifications" },
    { label: "Inventory", tab: "inventory" },
  ],
} satisfies AppUpdate;
