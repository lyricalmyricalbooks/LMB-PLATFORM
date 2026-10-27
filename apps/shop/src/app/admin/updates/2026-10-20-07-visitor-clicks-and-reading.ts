import type { AppUpdate } from "../appUpdates";

export default {
  id: "visitor-clicks-and-reading",
  date: "2026-10-20",
  title: "See which menus, filters and book-page tools visitors use",
  summary: "The shop now tells Google Analytics which menu links visitors click, what they do on a book page (swiping photos, opening Details or Reviews, switching editions, sharing), which shop filters they use, when they open the bag, how far down each page they read, and when they reach a missing page. Six new widgets on Overview › Visitors show this: Menu links people use, Missing pages people reach, What people do on a book page, Shop filters people use, How far people read, and Bag opened, then checkout? Book lists that get clicks now covers the shop grid, search, related books and recently viewed too. Four of the widgets need a one-time setting in Google Analytics (Admin › Custom definitions, scope Event: menu, link_text, action, tab, filter, value, percent); the widget names the missing ones. When Google doesn't answer a report, the widget now says so instead of looking empty. Counting starts once this update is live.",
  links: [{ label: "Overview", tab: "overview" }],
} satisfies AppUpdate;
