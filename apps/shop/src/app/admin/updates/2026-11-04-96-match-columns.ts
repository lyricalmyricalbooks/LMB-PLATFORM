import type { AppUpdate } from "../appUpdates";

export default {
  id: "match-columns",
  date: "2026-11-04",
  title: "Match columns the shop doesn't know",
  summary: "When a spreadsheet has a column the shop doesn't recognise, such as \"Cost to buyer\", Books › Import spreadsheet now lets you pick which field it fills. The preview updates as you choose, and a field can only be picked once.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
