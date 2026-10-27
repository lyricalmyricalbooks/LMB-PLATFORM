import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-title-change-words",
  date: "2026-10-22",
  title: "Overview: book lines in What changed say how much sales rose or fell",
  summary: "Today › What changed used to show a book's move as \"Tidal Notes slowed down\" with \"−CA$160.00 on the 30 days before\" underneath. It now reads like the country line: \"Sales of Tidal Notes fell by CA$160.00\", then what it took in each period and the copies sold (\"CA$60.00 now, CA$220.00 in the 30 days before; 3 copies vs 8\"). Same figures as before, only the wording changed.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
