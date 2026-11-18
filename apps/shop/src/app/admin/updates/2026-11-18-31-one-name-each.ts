import type { AppUpdate } from "../appUpdates";

export default {
  id: "one-name-each",
  date: "2026-11-18",
  title: "One name for each thing",
  summary: "Each menu item and the page it opens now share a name. Online store opens a page called Online store, the stockroom's sales list is All sales like on the website side, people who buy are Customers on both sides, and Email sender is now Emails.",
  links: [{ label: "Online store", tab: "design" }, { label: "Emails", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
