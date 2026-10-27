import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-needs-you-singular",
  date: "2026-10-22",
  title: "Needs you on the Overview says “1 review”, not “1 reviews”",
  summary:
    "When only one thing is waiting in the black Needs you panel on the Overview, its line now reads in the singular: “1 paid order waiting to ship”, “1 review to moderate”, “1 unread message” and so on, and the short note under it says “it” instead of “these”. Two or more still read in the plural. What the panel counts and where its buttons go are unchanged.",
  links: [{ label: "Open the Overview", tab: "overview" }],
} satisfies AppUpdate;
