import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-widget-board",
  date: "2026-10-18",
  title: "The Overview is now a board of widgets you arrange",
  summary: "Every analytics panel on the Overview is now its own widget, filed under one of seven topics (Today, Sales & money, Titles, Traffic & marketing, Search & site health, Customers, Stock), so page speed no longer sits beside best sellers. Fold any topic or widget, or press Fold everything. Edit board lets you drag widgets within their topic, resize them (S, M, L, XL), change their height, rename them and remove them, with Undo. Add widgets lists all 51 (search by word), and you can add as many trend charts and figure strips as you like, each set to its own measure. Open full view on any widget to see it large, with the rest of its topic underneath; Explore all on a topic shows every widget it has. You can keep several named boards (Daily desk, Money, Marketing, Stock, Launch week, Everything, or a copy of your own); they are saved to your account so they follow you to other devices once the new database rule is deployed, and to this browser straight away.",
  links: [{ label: "Open the Overview", tab: "overview" }],
} satisfies AppUpdate;
