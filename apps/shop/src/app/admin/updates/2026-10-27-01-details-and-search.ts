import type { AppUpdate } from "../appUpdates";

export default {
  id: "details-and-search",
  date: "2026-10-27",
  title: "Book details kept in step with the inventory app, and one search for both",
  summary: "When a matched book's title, author, ISBN or price isn't the same here and in the inventory app, Inventory › Inventory app link lists it under Details that differ from the app. Use the app's copies that one detail onto the website book after you confirm; Leave as is hides it until either value changes. The inventory app offers the same in the other direction. The search box at the top also finds the inventory app's books and ends with Search the inventory app for what you typed, and the inventory app's search can open a website book, order or search here. Nothing changes in either app unless you press a button.",
  links: [{ label: "Open Inventory app link", tab: "inventory" }],
} satisfies AppUpdate;
