import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-visitors-and-polish",
  date: "2026-10-19",
  title: "Overview: eight visitor widgets and a tidier board",
  summary: "Edit board › Add widgets has eight new widgets about what visitors do on the site: Being read right now, Pages people actually read (time on each page and how many read to the end), When visitors come (weekday and hour), What visitors do, Links visitors follow away, New and returning visitors, Where visitors drop off (one path from visit to purchase) and Looked at but not added. A new Visitors starter board puts them together. Most use Google Analytics and appear once the latest server update is deployed; Where visitors drop off and Looked at but not added use the shop's own counter. The board itself was tidied after three reviews: widgets no longer stretch to their neighbours' height, numbers no longer break across lines, money always shows cents in lists, titles no longer appear twice, charts read better on phones and at night, and the Add widgets tray is easier to search.",
  links: [{ label: "Open the Overview", tab: "overview" }],
} satisfies AppUpdate;
