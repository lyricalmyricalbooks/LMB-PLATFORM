import type { AppUpdate } from "../appUpdates";

export default {
  id: "inventory-link-counting", date: "2026-10-11", title: "Inventory app link: every matched book gets counted",
  summary: "Pressing Apply these numbers in Inventory › Inventory app link now switches stock counting on for every matched book that isn't counted yet, even when its number is already right. Before, a book like The Hound could stay \"Not counted\" however often you pressed Apply. The matching table also says plainly when a book isn't counted yet, and when the inventory app hasn't sent a count for a book (like Injured). The inventory app now moves books it still kept in its old storage over by itself, so their counts reach the website: open the inventory app once while online, then Preview stock changes and Apply.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
