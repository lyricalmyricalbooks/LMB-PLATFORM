import type { AppUpdate } from "../appUpdates";

export default {
  id: "one-todo-new-books",
  date: "2026-10-25",
  title: "One to-do list for both apps, and new books offered both ways",
  summary: "What waits in the inventory app now shows here, above every page, with a button that opens the right place in the app. The inventory app's to-do list shows what waits on the website too. Books the inventory app has that the shop doesn't are listed under Inventory › Inventory app link: Add to the shop opens a new draft website book filled in from the app and matches the two once you save it. Nothing is published until you publish it. In the other direction, the inventory app offers website books it doesn't have yet. These new lists start once the website's next scheduled update goes live; the inventory app's half also needs its updated access rules.",
  links: [{ label: "Open Inventory app link", tab: "inventory" }],
} satisfies AppUpdate;
