import type { AppUpdate } from "../appUpdates";

export default {
  id: "inventory-new-books", date: "2026-10-15", title: "New books are matched to the inventory app in one click",
  summary: "When you add a book to both the website and the inventory app, the website now notices within an hour that the two have the same ISBN or title. An alert appears, and Inventory › Inventory app link shows a New books to match box with Match these and Not these. Until a book is matched, its website sales don't reach the inventory app, so this stops a new title being forgotten. This needs the updated Functions to be deployed.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
