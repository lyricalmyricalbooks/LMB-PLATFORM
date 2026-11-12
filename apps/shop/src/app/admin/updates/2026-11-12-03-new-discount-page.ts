import type { AppUpdate } from "../appUpdates";

export default {
  id: "new-discount-page",
  date: "2026-11-12",
  title: "New discount and Add an expense are their own pages",
  summary: "New discount now opens a full page laid out like the new design: the code, what shoppers get and the rules, with a blue box beside it saying what the discount does. Add an expense works the same way. A bar at the bottom tells you what is still missing, and the Back link returns you to the list.",
  links: [{ label: "Open Discounts", tab: "discounts" }],
} satisfies AppUpdate;
