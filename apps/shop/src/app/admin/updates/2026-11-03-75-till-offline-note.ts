import type { AppUpdate } from "../appUpdates";

export default {
  id: "till-offline-note",
  date: "2026-11-03",
  title: "The Fair till's buttons stay clear when you're offline",
  summary: "If you have both the website and the stockroom, the admin's \"You're offline\" card no longer covers the Fair till and the other stockroom pages. Those pages already say you're offline in their own words and keep selling. Every other admin page still shows the card.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
