import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-tabs-visitor-paths",
  date: "2026-10-20",
  title: "Overview in tabs, and four new views of how visitors move",
  summary: "The Overview now opens one topic at a time: Today, Sales, Titles, Visitors, Search, Customers and Stock each have a tab, and Everything still shows the whole board. Visitors has its own second row (Right now, Where they come from, How they move, What they do, Where they leave), and the open tab stays in the address so Back and links work. Four new widgets read Google Analytics: Where people go next (page-to-page moves, and where each page's visitors came from and went), First page, then what (how far visits went from each first page, by source), Sections that get clicks (the share of books opened in each book section), and Phones vs computers, step by step. Page-to-page moves start counting once this update is live, so that widget fills in over the next days. The new Google reports need the shop's server update, which goes out with this change.",
  links: [{ label: "Overview", tab: "overview" }],
} satisfies AppUpdate;
